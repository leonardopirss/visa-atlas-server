# Feature Specification: Proteção da API, cache Redis e proxy Nginx

**Feature Branch:** `005-api-protection-cache-proxy`  
**Created:** 2026-10-31  
**Status:** Approved for implementation planning  
**Input:** proteger a API pública GET com Redis gratuito para cache/rate limit e Nginx como proxy reverso e balanceador.

## User Scenarios & Testing

### User Story 1 — Abuso não multiplica com as réplicas (Priority: P1)

Como operador, quero que todas as réplicas compartilhem o mesmo limite por cliente para que adicionar capacidade não permita contornar a proteção da API.

**Why this priority:** o limitador atual mantém estado em memória por processo. Cada nova réplica multiplica o volume permitido ao mesmo cliente.

**Independent Test:** duas instâncias alternam requisições do mesmo IP por meio de um Redis compartilhado; a soma respeita uma única política e retorna `429` com os headers existentes.

**Acceptance Scenarios:**

1. **Given** duas réplicas e um cliente abaixo do limite, **when** as chamadas alternam entre as réplicas, **then** ambas retornam sucesso e um único saldo compartilhado diminui.
2. **Given** o saldo compartilhado esgotado, **when** qualquer réplica recebe nova chamada, **then** retorna `429`, `Retry-After` e `RateLimit-*` coerentes.
3. **Given** Redis temporariamente indisponível, **when** uma chamada chega pelo Nginx, **then** a política de degradação aprovada é aplicada sem espera ou fila ilimitada.
4. **Given** um cliente envia `X-Forwarded-For` diretamente, **when** a chamada atravessa o Nginx, **then** somente a cadeia de proxy confiável determina o IP usado no limite.

---

### User Story 2 — Leituras repetidas não repetem queries (Priority: P1)

Como usuário, quero respostas rápidas e corretas para consultas repetidas, enquanto o banco é preservado para misses e novos releases.

**Why this priority:** todos os endpoints são leituras e vários resultados mudam apenas quando um release é publicado; repetir as mesmas queries no PostgreSQL desperdiça conexões e CPU.

**Independent Test:** após a primeira consulta elegível, uma segunda consulta canonicamente idêntica retorna o mesmo DTO sem acessar PostgreSQL; publicar ou restaurar outro release muda o namespace e impede dado antigo como atual.

**Acceptance Scenarios:**

1. **Given** uma chave ausente, **when** a API conclui uma resposta `2xx` elegível, **then** salva a resposta com TTL e limite de tamanho.
2. **Given** uma chave válida, **when** a consulta equivalente é repetida, **then** a API responde do Redis sem query de domínio no PostgreSQL.
3. **Given** erro `4xx`, `5xx`, exceção ou resposta acima do limite, **when** a chamada termina, **then** nada é salvo no cache.
4. **Given** novo release publicado ou rollback concluído, **when** uma consulta é repetida, **then** usa a nova versão de chave imediatamente.
5. **Given** Redis indisponível, **when** o banco possui capacidade, **then** a resposta correta é obtida do PostgreSQL e a falha de cache não vaza ao cliente.

---

### User Story 3 — A API possui uma única entrada protegida (Priority: P1)

Como operador, quero expor somente Nginx para distribuir tráfego, rejeitar bursts e impedir acesso direto às instâncias NestJS.

**Why this priority:** um limitador Redis não impede que tráfego volumoso consuma sockets e event loop antes de chegar ao middleware da aplicação.

**Independent Test:** o endereço público distribui chamadas entre duas réplicas, portas internas não são alcançáveis e uma réplica indisponível não interrompe a outra.

**Acceptance Scenarios:**

1. **Given** duas réplicas saudáveis, **when** chamadas chegam ao Nginx, **then** são distribuídas sem sticky session.
2. **Given** burst acima da política de borda, **when** chamadas excedentes chegam, **then** Nginx retorna `429` antes do Node.js.
3. **Given** método fora do contrato ou request acima dos limites, **when** chega ao Nginx, **then** é rejeitado de forma previsível.
4. **Given** uma réplica falha, **when** novas chamadas chegam, **then** Nginx deixa de encaminhá-las ao upstream falho conforme a política passiva.
5. **Given** acesso externo à porta de uma réplica, **when** a conexão é tentada, **then** a rede não a publica.

---

### User Story 4 — Dependências degradam sem derrubar o sistema (Priority: P2)

Como operador, quero que falhas de Redis, cache frio ou saturação do banco falhem rapidamente e com observabilidade, sem tempestade de queries.

**Why this priority:** Redis gratuito não oferece SLA de produção e pode bloquear comandos ao atingir cota; o fallback precisa continuar limitado.

**Independent Test:** Redis é interrompido durante carga controlada; Nginx continua limitando, o backend não acumula comandos, o pool PostgreSQL permanece no orçamento e saturação retorna `503` sanitizado.

**Acceptance Scenarios:**

1. **Given** Redis lento ou indisponível, **when** o timeout curto expira, **then** o circuito abre e chamadas seguintes não aguardam repetidamente a dependência.
2. **Given** muitos misses simultâneos na mesma chave, **when** o cache está frio, **then** single-flight/lock curto reduz queries duplicadas sem espera indefinida.
3. **Given** PostgreSQL sem capacidade, **when** uma leitura não pode ser iniciada dentro do orçamento, **then** retorna `503` seguro com correlation ID.
4. **Given** cota Redis em 70%, 85% ou 95%, **when** o alerta dispara, **then** o runbook define redução de uso, upgrade ou desativação controlada.

### Edge Cases

- Muitos usuários legítimos podem compartilhar um IP por NAT; limites entram primeiro em modo observe e são ajustados com telemetria.
- IPv4, IPv6 e IPv4 mapeado em IPv6 precisam produzir identificadores normalizados.
- O endereço bruto do cliente não deve ser parte legível da chave; usar identificador HMAC de tamanho fixo.
- Query parameters equivalentes em ordens ou representações diferentes precisam gerar a mesma chave após validação/normalização.
- Queries inválidas nunca criam chaves Redis.
- Todas as chaves de cache e rate limit precisam expirar.
- Mudança de release durante preenchimento do cache não pode publicar resposta sob o namespace novo incorreto.
- Eviction ou limite de memória transforma cache em miss; não transforma Redis em fonte de dados.
- Esgotamento da cota gratuita pode bloquear comandos; Nginx e proteção PostgreSQL continuam obrigatórios.
- Uma resposta comprimida no Nginx e sua representação interna não devem alterar o DTO do contrato.

## Requirements

### Functional Requirements

- **FR-001:** Nginx MUST ser o único ponto de entrada público para `/api/v1` em produção.
- **FR-002:** Nginx MUST balancear entre no mínimo duas réplicas NestJS stateless sem sticky session.
- **FR-003:** Nginx MUST aplicar limite de burst por IP e proteção global antes de encaminhar tráfego.
- **FR-004:** Nginx MUST retornar `429` para limite de requisição e preservar um formato HTTP previsível.
- **FR-005:** Nginx MUST encaminhar headers de proxy somente de uma cadeia confiável e sobrescrever valores recebidos diretamente do cliente quando necessário.
- **FR-006:** Portas das réplicas NestJS MUST permanecer em rede privada.
- **FR-007:** A aplicação MUST usar um Redis compartilhado para rate limit distribuído entre réplicas.
- **FR-008:** A decisão de rate limit MUST ser atômica e MUST aplicar TTL a todos os estados criados.
- **FR-009:** O identificador de cliente no Redis MUST ter tamanho fixo e não expor o IP bruto.
- **FR-010:** A API MUST preservar `429`, `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`.
- **FR-011:** Políticas MUST ser configuráveis por grupo de endpoint sem alterar código de domínio.
- **FR-012:** O rate limit MUST possuir modos observe, enforce e fallback controlados por configuração.
- **FR-013:** A aplicação MUST usar cache-aside somente para rotas públicas allow-listed.
- **FR-014:** Somente respostas `2xx` completas e abaixo do tamanho máximo MAY entrar no cache.
- **FR-015:** `4xx`, `5xx`, exceções, respostas parciais e dados não publicados MUST NOT entrar no cache.
- **FR-016:** Todas as entradas de cache MUST possuir TTL com jitter.
- **FR-017:** Chaves de cache MUST incluir ambiente, contrato, rota lógica, query canônica e versão do release aplicável.
- **FR-018:** Publicação/rollback MUST tornar a nova versão visível sem `KEYS` ou varredura global.
- **FR-019:** A aplicação MUST limitar preenchimentos simultâneos da mesma chave com espera curta e limitada.
- **FR-020:** Falha de cache MUST ser tratada como miss enquanto houver capacidade segura no PostgreSQL.
- **FR-021:** Redis MUST usar TLS e autenticação fora do ambiente local.
- **FR-022:** Credenciais Redis MUST existir somente em variável de ambiente/secret manager e MUST NOT aparecer em logs.
- **FR-023:** O cliente Redis MUST usar timeout curto, backoff limitado, circuit breaker e offline queue desabilitada.
- **FR-024:** PostgreSQL MUST possuir orçamento de pool por réplica, timeout de aquisição e statement timeout.
- **FR-025:** Leituras caras MUST possuir limite de concorrência/backpressure.
- **FR-026:** Saturação MUST falhar rapidamente com `503` sanitizado e correlation ID.
- **FR-027:** O sistema MUST medir `429`, `5xx`, latência, cache hit/miss, erros Redis, cota/evictions e conexões/queries PostgreSQL.
- **FR-028:** Ativação de Redis rate limit, cache e Nginx MUST ser gradual e possuir rollback independente.
- **FR-029:** O contrato dos cinco endpoints GET MUST permanecer compatível.
- **FR-030:** Testes integrados MUST usar Redis, PostgreSQL, Nginx e múltiplas réplicas reais em ambiente isolado.

### Initial Policies

Valores iniciais entram em modo observe e precisam ser confirmados com tráfego do ambiente alvo:

| Camada | Escopo                                    | Política inicial                                         |
| ------ | ----------------------------------------- | -------------------------------------------------------- |
| Nginx  | Por IP                                    | 5 req/s, burst 10, `nodelay`                             |
| Nginx  | Virtual host                              | 100 req/s, burst 50; recalibrar por capacidade do deploy |
| Redis  | Todos os endpoints por IP                 | 120 req/min                                              |
| Redis  | `/stats/map`, detalhe e timeseries por IP | 60 req/min dentro do limite global                       |
| Redis  | Cota longa por IP                         | 1.000 req/dia                                            |

### Initial Cache Policy

| Grupo                         | TTL base | Máximo por item | Observação                          |
| ----------------------------- | -------: | --------------: | ----------------------------------- |
| `/filters/defaults`           |    5 min |          16 KiB | Muda com release publicado          |
| `/countries`                  |      6 h |         128 KiB | Query canônica inclui busca/página  |
| `/stats/map`                  |   15 min |         128 KiB | Maior payload observado no baseline |
| `/countries/:iso3`            |   15 min |         128 KiB | Inclui versão do release e filtros  |
| `/countries/:iso3/timeseries` |   30 min |         128 KiB | Inclui intervalo e grupo            |

Todos os TTLs usam jitter inicial de 10%. Versionamento por release garante frescor antes do TTL quando há publicação ou rollback.

### Key Entities

- **RateLimitPolicy:** grupo de rota, janela/burst ou emissão GCRA, cota longa, modo e headers resultantes.
- **ClientIdentity:** HMAC normalizado do IP obtido somente da cadeia de proxy confiável.
- **CacheKey:** ambiente, versão de contrato, rota lógica, versão do release e hash da query canônica.
- **CacheEntry:** DTO serializado, tamanho, instante de criação e TTL; sempre reconstruível do PostgreSQL.
- **PublishedReleaseVersion:** identidade do snapshot publicado que separa namespaces atuais e antigos.

## Success Criteria

### Measurable Outcomes

- **SC-001:** 100% do tráfego público da API passa pelo Nginx; nenhuma porta NestJS é publicamente alcançável.
- **SC-002:** duas ou mais réplicas aplicam um único limite compartilhado sem overshoot causado por race condition.
- **SC-003:** 100% das respostas limitadas preservam `429`, `Retry-After` e headers `RateLimit-*` válidos.
- **SC-004:** uma segunda requisição canonicamente idêntica e aquecida não executa query de domínio no PostgreSQL.
- **SC-005:** o workload repetido aprovado reduz em pelo menos 70% as queries PostgreSQL após aquecimento.
- **SC-006:** cache hit ratio dos endpoints elegíveis atinge pelo menos 80% após sete dias de tráfego estável; abaixo disso exige revisão de TTL/chaves.
- **SC-007:** p95 de resposta com cache aquecido fica abaixo de 100 ms no ambiente alvo sob carga nominal aprovada.
- **SC-008:** falha Redis é detectada dentro de 250 ms por comando e não cria offline queue ou espera ilimitada.
- **SC-009:** durante teste Redis-offline, o pool PostgreSQL permanece dentro do orçamento e saturação retorna `503` sanitizado.
- **SC-010:** publicação ou rollback nunca retorna release anterior sob o namespace vigente.
- **SC-011:** uso do Redis gratuito alerta em 70%, 85% e 95% da cota mensal e possui ação documentada antes de bloqueio.
- **SC-012:** testes integrados não apresentam `5xx` inesperado nem regressão do contrato dos cinco endpoints.

## Assumptions

- A API continua pública e sem autenticação nesta entrega; IP é o único identificador defensivo disponível.
- Os dados cacheados são públicos; IP bruto não é armazenado em chaves ou logs.
- PostgreSQL continua sendo a única fonte de verdade.
- O backend será implantado em região conhecida e Redis ficará na mesma região sempre que possível.
- O plano gratuito é adequado apenas ao MVP/tráfego baixo e não oferece SLA de produção.
- A primeira versão não usa Nginx `proxy_cache`, CDN, WAF gerenciado ou Redis como sessão/fila.
- Ingestão continua sem rota pública e fora do caminho Nginx da API pública.

## Out of Scope

- Autenticação, contas, API keys e limites por usuário.
- Cache Nginx/CDN e invalidação em múltiplas camadas.
- Alta disponibilidade paga, multi-zone, VPC peering ou SLA contratado.
- Alteração de DTOs de negócio ou criação de novos endpoints públicos.
- Persistir dados de domínio no Redis.
- Executar rollout em produção sem um ambiente/destino explicitamente aprovado.
