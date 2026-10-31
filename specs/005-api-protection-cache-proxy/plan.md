# Implementation Plan: Proteção da API, cache Redis e proxy Nginx

**Feature:** `005-api-protection-cache-proxy`  
**Data:** 2026-10-31  
**Spec:** [spec.md](./spec.md)  
**Research:** [research.md](./research.md)

## Summary

Evoluir a API pública e somente leitura do Visa Atlas para uma topologia com Nginx como ponto único de entrada, duas ou mais réplicas NestJS e Redis compartilhado para rate limiting distribuído e cache de respostas/consultas. O objetivo é reduzir consultas repetidas ao PostgreSQL, impedir que a multiplicação de réplicas multiplique o limite por cliente e absorver picos sem expor diretamente a aplicação.

A implantação será incremental. Primeiro serão obtidas métricas de referência; depois Redis, rate limiting, cache e Nginx serão introduzidos separadamente. Cada fase precisa funcionar e ser reversível antes da próxima. PostgreSQL permanece como fonte de verdade, e indisponibilidade do Redis não pode produzir dados incorretos nem derrubar silenciosamente a API.

## Technical Context

- **Linguagem/runtime:** TypeScript strict, Node.js e NestJS conforme as versões fixadas no projeto.
- **API:** Express via NestJS, rotas públicas versionadas em `/api/v1`, somente `GET` no contrato atual.
- **Persistência:** PostgreSQL com Prisma; releases publicados permanecem como fonte de verdade.
- **Cache e coordenação:** Redis compatível com protocolo Redis e operações atômicas, com TLS em produção.
- **Entrada HTTP:** Nginx OSS como proxy reverso, limitador de pico e balanceador de carga.
- **Testes:** Jest, Supertest, testes de integração com PostgreSQL/Redis reais em ambiente isolado e teste de carga controlado.
- **Topologia inicial:** `cliente -> Nginx -> 2+ réplicas NestJS -> Redis/PostgreSQL`.
- **Observabilidade:** correlation ID existente, logs estruturados e métricas de tráfego, cache, Redis, banco e upstreams.
- **Restrições:** plano gratuito do Redis, API pública sem segredo no frontend, nenhuma dependência do Redis para correção dos dados e nenhum acesso público direto às réplicas NestJS.

## Architecture Decisions

### AD-001 — Duas camadas de limitação com finalidades diferentes

- O Nginx limita picos por IP antes que alcancem Node.js.
- A aplicação usa Redis para aplicar uma política distribuída e consistente entre todas as réplicas.
- Os limites não devem ser somados acidentalmente de forma que clientes legítimos recebam `429` antes da política documentada.
- O limite em memória atual será removido somente depois que o limitador Redis estiver validado em mais de uma réplica.

### AD-002 — Cache-aside no backend, sem cache de erro

- A aplicação consulta Redis antes do PostgreSQL e grava somente respostas `2xx` elegíveis.
- `4xx`, `5xx`, exceções, respostas incompletas e dados de ingestão ainda não publicados nunca entram no cache.
- Todas as chaves de cache possuem TTL; nenhum valor de resposta é permanente.
- A primeira versão não adicionará `proxy_cache` no Nginx para evitar duas políticas de invalidação concorrentes. `Cache-Control` HTTP continuará atendendo navegador/CDN.

### AD-003 — Invalidação por versão de dados

- Chaves incluem namespace, versão do contrato e identificador do release publicado, por exemplo `visa:v1:stats:<releaseId>:<queryHash>`.
- A publicação de um novo release altera a versão usada nas novas chaves; chaves antigas expiram por TTL.
- Evitar `KEYS`, exclusões globais e invalidação por varredura, especialmente em um Redis gratuito.
- Queries são normalizadas antes do hash para que parâmetros equivalentes compartilhem a mesma chave sem armazenar entrada bruta arbitrária.

### AD-004 — Redis é proteção e otimização, não fonte de verdade

- Em falhas breves do Redis, leituras podem recorrer ao PostgreSQL, com timeout, limite de concorrência e proteção do Nginx.
- O cliente Redis usa timeout curto, reconexão com backoff e circuit breaker para não aumentar a latência de todas as requisições.
- Falha de cache é `cache miss`; falha do limitador é registrada e segue a política de degradação definida na Fase 0.
- Para esta API pública, o rate limit da aplicação opera em modo fail-open durante falha Redis, porque o Nginx continua limitando picos. A Fase 6 precisa comprovar que esse fallback não satura PostgreSQL/aplicação antes da produção.

### AD-005 — Redis gratuito exige orçamento explícito

- Separar namespaces e TTLs de `ratelimit` e `cache`, mesmo que o plano gratuito obrigue o uso da mesma instância.
- Todos os contadores de rate limit expiram; todas as entradas de cache expiram.
- Definir alertas para memória, comandos, conexões, banda, evictions, erros e aproximação da cota do provedor.
- Upstash Free foi aprovado condicionalmente para o MVP: 256 MB, 500 mil comandos/mês, TLS e protocolo Redis nativo. A região deve ser a mesma do backend.
- A eviction `optimistic-volatile` será habilitada e todas as chaves terão TTL. O teto prático estimado é inferior a 250 mil requests/mês quando cada request usa rate limit + cache; reservar 10% para misses/operação.

### AD-006 — Nginx é a única origem de tráfego aceita pela aplicação

- Portas das réplicas NestJS ficam apenas na rede privada da implantação.
- Nginx encaminha `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` e correlation ID conforme política explícita.
- NestJS configura `trust proxy` somente para o hop/rede do Nginx; headers encaminhados da internet não são confiados diretamente.
- TLS termina no Nginx ou no load balancer gerenciado imediatamente anterior. O trecho seguinte deve permanecer em rede privada confiável ou usar TLS interno conforme o ambiente.

## Provider Selection Gate — Approved with conditions

- **Selected:** Upstash Free via native Redis TCP/TLS and official `redis`/node-redis client.
- **Region:** colocate with the backend; prefer AWS São Paulo `sa-east-1` when the backend is deployed there.
- **Free limits recorded on 2026-10-31:** 256 MB, 500,000 commands/month and 10 GB/month bandwidth.
- **Security:** TLS is mandatory; secrets remain in environment/secret manager. Free-tier limitations such as lack of paid SLA/advanced controls are accepted only for the MVP.
- **Eviction:** enable Upstash `optimistic-volatile`; every cache and rate-limit key has a TTL.
- **Portability:** do not use the proprietary REST SDK in the first implementation; EVAL/GCRA uses Redis protocol.
- **Upgrade trigger:** alert at 70/85/95% of commands and decide upgrade by 85%.

Redis Cloud Essentials Free was rejected for remote production use because its official documentation states that TLS is unavailable on the free plan. Full evidence and the command budget are in [research.md](./research.md).

## Delivery Phases

### Phase 0 — Baseline, política e critérios de capacidade

**Status:** completed on 2026-10-31; evidence in [research.md](./research.md).

**Objetivo:** medir antes de introduzir cache ou limites novos.

- Inventariar os endpoints, custo médio/pior caso, cardinalidade das queries e tamanho das respostas.
- Medir requisições por segundo, p50/p95/p99, taxa de erro, consultas ao PostgreSQL e conexões usadas em cenário frio e aquecido.
- Definir SLOs e orçamento de erro para disponibilidade e latência.
- Definir limites provisórios por endpoint: pico por segundo, janela sustentada e cota longa, sem assumir que todos os endpoints têm o mesmo custo.
- Definir quais respostas podem ser públicas e cacheáveis e quais campos futuros exigiriam isolamento por identidade.
- Confirmar a política de falha Redis: cache fail-open; rate limit fail-open protegido pelo Nginx ou fail-closed para eventual endpoint sensível.
- Produzir `research.md` com o provider selection gate e a estimativa de consumo da cota gratuita.

**Exit gate:** passed. Baseline reproduzível, SLOs mensuráveis, endpoints classificados por custo/cacheabilidade, GCRA/node-redis escolhidos e Upstash Free aprovado condicionalmente.

### Phase 1 — Fundação Redis e configuração segura

**Objetivo:** conectar Redis sem alterar ainda o comportamento HTTP.

- Adicionar módulo Redis com uma única estratégia de conexão compartilhada por processo e encerramento limpo.
- Validar variáveis como URL, TLS, timeouts, prefixo de ambiente e política de habilitação; nunca registrar credenciais.
- Criar contratos pequenos para cache e rate limit, evitando espalhar comandos Redis pelos serviços de domínio.
- Adicionar Redis local ao Docker Compose apenas para desenvolvimento/teste; produção usa serviço gerenciado aprovado.
- Implementar métricas de conexão, latência, timeout, erro e circuit breaker.
- Separar liveness da dependência Redis; readiness deve indicar degradação de modo observável sem criar ciclo de reinício por uma falha opcional.
- Testar conexão TLS/configuração, indisponibilidade, timeout, reconexão e shutdown.

**Exit gate:** aplicação inicia com Redis habilitado e desabilitado, não vaza segredo, degrada de maneira conhecida e passa nos testes de integração.

### Phase 2 — Rate limiting distribuído

**Objetivo:** substituir o `Map` local por contadores consistentes entre réplicas.

- Implementar algoritmo atômico de token bucket, sliding window ou GCRA; a decisão deve considerar comandos e memória do plano gratuito.
- Usar chave por IP normalizado e, quando houver autenticação futura, combinar política por usuário/API key com limite defensivo por IP.
- Manter `429`, `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset` consistentes com o contrato atual.
- Aplicar TTL obrigatório e namespace por ambiente/versão em todas as chaves.
- Permitir políticas por grupo de endpoint, mantendo defaults seguros.
- Proteger o Redis contra cardinalidade ilimitada: comprimento fixo das chaves, hash de identificadores e orçamento/alerta de chaves.
- Validar que duas ou mais réplicas compartilham o mesmo contador e que concorrência não ultrapassa o limite por race condition.
- Manter o limiter atual disponível apenas como rollback temporário; não executar dois limiters da aplicação em paralelo na produção final.

**Exit gate:** testes concorrentes comprovam um único limite entre réplicas, headers e `429` permanecem compatíveis e falha Redis segue a política aprovada.

### Phase 3 — Cache Redis das leituras públicas

**Objetivo:** reduzir consultas repetidas ao PostgreSQL sem comprometer frescor ou correção.

- Mapear TTL por categoria: catálogo relativamente estável, filtros/defaults, mapa agregado, detalhe e série histórica.
- Implementar cache-aside no ponto de serviço/interceptor que conhece o DTO final e a identidade do release.
- Gerar chaves a partir de rota lógica, versão do contrato, release e query canônica validada.
- Adicionar jitter ao TTL para evitar expiração simultânea em massa.
- Prevenir cache stampede para chaves quentes com single-flight local ou lock Redis curto e limitado; nunca esperar indefinidamente pelo lock.
- Definir tamanho máximo de item e não cachear respostas acima do orçamento aprovado.
- Preservar `Cache-Control`/ETag HTTP e documentar diferença entre cache Redis e cache do cliente/CDN.
- Instrumentar hit, miss, stale, bypass, erro, bytes e latência por grupo de endpoint, sem usar query/ID como label de alta cardinalidade.
- Validar publicação de novo release: novas requisições usam nova versão imediatamente e dados antigos desaparecem por TTL.

**Exit gate:** chamadas repetidas elegíveis deixam de consultar PostgreSQL após o aquecimento, novo release não retorna dados antigos e falha do cache não altera a resposta correta.

### Phase 4 — Nginx como reverse proxy e balanceador

**Objetivo:** criar um único ponto de entrada endurecido e distribuir tráfego entre réplicas.

- Criar configuração versionada com `upstream` para no mínimo duas instâncias NestJS.
- Começar com round-robin; avaliar `least_conn` somente se as medições mostrarem duração desigual relevante.
- Configurar keep-alive com upstream, timeouts de conexão/leitura/envio e limites de conexões.
- Aplicar `limit_req` por IP com burst pequeno e uma proteção global por virtual host; retornar `429`, não o status padrão não contratual.
- Limitar tamanho de URI/headers e corpo; a API GET não deve aceitar payload arbitrário.
- Permitir somente métodos do contrato, incluindo `HEAD` e `OPTIONS` quando necessários à operação HTTP/CORS; rejeitar os demais de forma previsível.
- Propagar IP/protocolo/correlation ID com sobrescrita controlada e remover headers hop-by-hop inadequados.
- Desabilitar exposição de versão, aplicar headers de segurança pertinentes e configurar logs sanitizados.
- Expor apenas Nginx externamente e validar que as portas NestJS não são alcançáveis fora da rede privada.
- Planejar TLS e renovação de certificado conforme o destino de deploy; não versionar chaves privadas.
- Não habilitar sticky session: a API é stateless e Redis é compartilhado.

**Exit gate:** tráfego é distribuído entre réplicas saudáveis, acesso direto é bloqueado, IP real é interpretado corretamente e limites Nginx/aplicação convivem sem falsos bloqueios.

### Phase 5 — Proteção do PostgreSQL e resiliência

**Objetivo:** impedir que cache miss, Redis indisponível ou ataque transfira carga ilimitada ao banco.

- Definir pool máximo por réplica considerando o limite total do PostgreSQL.
- Configurar statement timeout e timeout de aquisição de conexão.
- Manter paginação e limites atuais; revisar intervalos temporais e cardinalidade das respostas agregadas.
- Adicionar limite de concorrência/backpressure para operações caras.
- Validar índices e planos de execução dos endpoints públicos com seus piores filtros permitidos.
- Evitar retry automático de query cara sob saturação; retries só para falhas transitórias claramente classificadas e com orçamento curto.
- Definir resposta controlada `503` quando a aplicação não puder servir sem agravar a saturação.

**Exit gate:** teste com Redis indisponível não esgota pool/memória, timeouts encerram trabalho caro e a aplicação recupera sem reinício manual.

### Phase 6 — Testes funcionais, segurança e carga

**Objetivo:** provar comportamento integrado antes do rollout.

- Unitários: chave canônica, TTL/jitter, política por endpoint, headers e fallback.
- Integração: Redis real, PostgreSQL real, concorrência, expiração, release novo e indisponibilidade Redis.
- Topologia: Nginx com duas ou mais réplicas, distribuição de tráfego, retirada de upstream falho e recuperação.
- Segurança: spoof de `X-Forwarded-For`, métodos não permitidos, queries inválidas, URI/headers grandes, enumeração e cardinalidade de chaves.
- Carga: cache frio, cache quente, hot key, muitas chaves, burst por IP, múltiplos IPs e Redis fora do ar.
- Confirmar que testes não usam produção nem excedem a cota do provedor gratuito; preferir Redis local isolado e um smoke test pequeno no serviço gerenciado.
- Executar lint, format check, typecheck, Jest, build, validação OpenAPI e auditoria de dependências.

**Exit gate:** SLOs definidos na Fase 0 atendidos, proteção do banco comprovada, nenhum bypass por réplica/IP encaminhado e rollback ensaiado.

### Phase 7 — Rollout gradual e operação

**Objetivo:** ativar com observabilidade e rollback simples.

- Implantar conexão Redis desativada funcionalmente e observar estabilidade.
- Ativar rate limit Redis em modo de observação/dry-run, comparar decisões e então aplicar bloqueio.
- Ativar cache por endpoint, começando pelos dados mais estáveis e de maior repetição.
- Colocar Nginx na frente de uma réplica, depois adicionar as demais e remover exposição direta.
- Acompanhar `429`, `5xx`, p95/p99, cache hit ratio, comandos/memória/evictions Redis, queries e conexões PostgreSQL.
- Criar alertas de cota gratuita em 70%, 85% e 95%, quando o provedor permitir.
- Documentar runbook para Redis indisponível, cota esgotada, cache inconsistente, upstream falho, rotação de credencial e rollback.
- Revisar limites após tráfego real; alterações de limite são configuração versionada e auditável.

**Exit gate:** período de observação sem regressão de contrato/SLO, dashboards e alertas ativos, runbook testado e acesso direto às réplicas encerrado.

## Configuration Surface

Nomes finais podem ser ajustados à convenção do projeto, mas a configuração deve cobrir:

```text
REDIS_ENABLED
REDIS_URL
REDIS_CONNECT_TIMEOUT_MS
REDIS_COMMAND_TIMEOUT_MS
REDIS_KEY_PREFIX

RATE_LIMIT_ENABLED
RATE_LIMIT_MODE
RATE_LIMIT_DEFAULT_MAX
RATE_LIMIT_DEFAULT_WINDOW_MS

CACHE_ENABLED
CACHE_DEFAULT_TTL_SECONDS
CACHE_MAX_ITEM_BYTES
CACHE_TTL_JITTER_PERCENT

TRUST_PROXY
DATABASE_POOL_MAX
DATABASE_STATEMENT_TIMEOUT_MS
```

Segredos ficam fora de `.env.example`; o exemplo contém somente placeholders seguros e documentação.

## Project Structure

```text
visa-atlas-server/
├── deploy/
│   └── nginx/
│       ├── nginx.conf
│       └── conf.d/visa-atlas.conf
├── specs/005-api-protection-cache-proxy/
│   ├── plan.md
│   ├── research.md
│   ├── quickstart.md
│   └── tasks.md
├── src/common/
│   ├── cache/
│   ├── redis/
│   └── http/
├── src/config/environment.ts
├── test/integration/
├── test/contract/
├── test/security/
└── test/load/
```

**Structure decision:** manter o monólito modular e adicionar somente infraestrutura transversal. Redis não cria um novo serviço de domínio, e Nginx fica isolado em configuração de deploy.

## Contract Impact

- Nenhuma rota ou DTO de negócio precisa mudar.
- `429` e headers de rate limit já existentes são preservados.
- Pode ser necessário documentar `503` para saturação/dependência e padronizar `HEAD`/`OPTIONS`.
- Cache não pode alterar corpo, ordenação, status ou semântica das cinco rotas públicas.
- Mudanças contratuais passam pela especificação compartilhada/OpenAPI antes da implementação.

## Constitution Check

- [x] PostgreSQL permanece fonte de verdade; Redis contém apenas dados reconstruíveis e contadores efêmeros.
- [x] Segredos do Redis/TLS não entram no repositório, logs ou frontend.
- [x] Entradas continuam validadas e limitadas no servidor.
- [x] Rate limiting é consistente entre réplicas e não depende apenas de CORS.
- [x] Falhas retornam mensagens seguras, correlation ID e status HTTP previsível.
- [x] Nenhuma nova rota pública de ingestão é criada.
- [x] A implantação é incremental, testável e reversível.
- [x] Testes integrados usam ambientes isolados, nunca produção.

Gate revalidado em 2026-10-31 após seleção condicional de Upstash Free, GCRA/EVAL, node-redis, cache fail-open e rate limit fail-open protegido pelo Nginx. Revalidar novamente após o design implementado e antes do rollout.

## Success Criteria

- 100% do tráfego público passa pelo Nginx e nenhuma porta NestJS é publicamente acessível.
- Duas ou mais réplicas aplicam um único limite compartilhado sem overshoot por race condition.
- 100% das rejeições preservam `429`, `Retry-After` e headers `RateLimit-*` válidos.
- Uma requisição elegível, canonicamente idêntica e aquecida executa zero query de domínio no PostgreSQL.
- O workload repetido aprovado reduz queries PostgreSQL em pelo menos 70% e atinge hit ratio de pelo menos 80% após sete dias estáveis.
- P95 de cache hit fica abaixo de 100 ms no ambiente alvo sob carga nominal; p99 geral fica abaixo de 500 ms.
- Redis indisponível é detectado em até 250 ms por comando, sem offline queue, resposta incorreta ou tempestade descontrolada no banco.
- Publicação/rollback nunca serve release anterior sob o namespace vigente.
- Alertas disparam em 70%, 85% e 95% da cota mensal do Redis gratuito, com decisão de upgrade até 85%.
- O contrato HTTP dos cinco endpoints permanece compatível e o teste nominal possui zero `5xx` inesperado.

## Risks and Mitigations

- **Plano gratuito esgotar comandos/memória:** teto teórico inferior a 250 mil requests/mês no caminho rate limit + cache; TTL obrigatório, chaves compactas, alertas 70/85/95%, cache seletivo e upgrade antes do limite.
- **Cache stampede:** jitter, single-flight/lock curto, backpressure e timeout do banco.
- **Dados antigos após publicação:** versão do release na chave, sem depender de exclusão global.
- **IP falsificado ou todos os clientes no mesmo IP:** cadeia de proxies confiável e `trust proxy` restrito.
- **Limites duplicados bloquearem usuários legítimos:** dry-run, métricas e política coordenada entre Nginx e aplicação.
- **Redis virar ponto único de falha:** fallback controlado, circuit breaker e Nginx como proteção independente.
- **Réplicas multiplicarem conexões PostgreSQL/Redis:** orçamento global de pool e conexões por processo.
- **Nginx OSS manter upstream ruim temporariamente:** timeouts e falha passiva configurados; health check ativo gerenciado fica fora da primeira entrega salvo necessidade comprovada.
- **Cachear resposta futura personalizada:** allow-list explícita de rotas públicas cacheáveis e inclusão de escopo/identidade na chave antes de qualquer autenticação.

## References

- Nginx HTTP load balancing: <https://nginx.org/en/docs/http/load_balancing.html>
- Nginx request limiting: <https://nginx.org/en/docs/http/ngx_http_limit_req_module.html>
- Redis key expiration: <https://redis.io/docs/latest/develop/using-commands/keyspace/>
- Redis eviction policies: <https://redis.io/docs/latest/develop/reference/eviction/>
- OWASP API4 — Unrestricted Resource Consumption: <https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/>
