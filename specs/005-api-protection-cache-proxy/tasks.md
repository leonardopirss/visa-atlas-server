# Tasks: Proteção da API, cache Redis e proxy Nginx

**Input:** [plan.md](./plan.md)  
**Feature:** `005-api-protection-cache-proxy`  
**Status:** pronta para refinamento e execução após os gates da Fase 1

## Format

- `[P]`: pode ser executada em paralelo porque atua em arquivos diferentes e não depende de tarefa incompleta na mesma fase.
- `[US1]`: rate limiting distribuído.
- `[US2]`: cache Redis para leituras públicas.
- `[US3]`: Nginx, isolamento e balanceamento das réplicas.
- `[US4]`: proteção do PostgreSQL, degradação e operação integrada.
- Cada tarefa deve resultar em código, teste, decisão registrada ou documentação verificável no caminho indicado.

## Deliverables

| Entregável                  | Resultado verificável                                               | Tarefas   |
| --------------------------- | ------------------------------------------------------------------- | --------- |
| D0 — Decisões e baseline    | Spec formal, SLOs, limites iniciais e provedor Redis aprovados      | T001–T007 |
| D1 — Fundação Redis         | Cliente seguro e testado, habilitável sem mudar respostas HTTP      | T008–T018 |
| D2 — Rate limit distribuído | Um único contador entre réplicas e contrato `429` preservado        | T019–T029 |
| D3 — Cache de leitura       | Requisições aquecidas elegíveis não consultam PostgreSQL            | T030–T043 |
| D4 — Proxy e balanceamento  | Nginx como única entrada, distribuindo para no mínimo duas réplicas | T044–T055 |
| D5 — Resiliência do banco   | Cache miss/falha Redis não esgota PostgreSQL ou aplicação           | T056–T063 |
| D6 — Validação integrada    | Segurança, contrato, carga, falhas e rollback comprovados           | T064–T072 |
| D7 — Operação e rollout     | Runbook, alertas e ativação gradual documentados                    | T073–T079 |

---

## Phase 1: Discovery, especificação e gates

**Purpose:** eliminar decisões abertas que alteram algoritmo, dependência, custo ou comportamento de falha.

- [x] T001 Formalizar requisitos, cenários de abuso, prioridades, critérios de aceite e itens fora de escopo em `specs/005-api-protection-cache-proxy/spec.md`.
- [x] T002 Inventariar custo, tamanho de resposta, cardinalidade, queries e cacheabilidade dos cinco endpoints em `specs/005-api-protection-cache-proxy/research.md`.
- [x] T003 Registrar baseline reproduzível de cache frio/quente, p50/p95/p99, taxa de erro, queries e conexões PostgreSQL em `specs/005-api-protection-cache-proxy/research.md`.
- [x] T004 [P] Comparar provedores Redis gratuitos por região, TLS, memória, comandos, banda, conexões, eviction, observabilidade e suspensão por cota em `specs/005-api-protection-cache-proxy/research.md`.
- [x] T005 [P] Definir limites provisórios por grupo de endpoint, incluindo burst, janela sustentada, cota longa e política `429`, em `specs/005-api-protection-cache-proxy/spec.md`.
- [x] T006 Definir e justificar algoritmo de rate limit, cliente Redis, política de eviction, TTLs iniciais e comportamento fail-open/fail-closed em `specs/005-api-protection-cache-proxy/research.md` (depende de T002–T005).
- [x] T007 Revalidar Constitution Check, impacto OpenAPI e metas numéricas de sucesso em `specs/005-api-protection-cache-proxy/plan.md` (depende de T001–T006).

**Checkpoint D0:** spec, baseline, SLOs, provedor e decisões arquiteturais aprovados. Nenhuma dependência Redis deve ser instalada antes deste gate.

---

## Phase 2: Fundação Redis compartilhada

**Purpose:** disponibilizar Redis como infraestrutura opcional e observável sem alterar o comportamento público.

**⚠️ CRITICAL:** D1 bloqueia US1 e US2.

### Tests

- [x] T008 [P] Criar testes de validação das novas variáveis, defaults seguros e rejeição de configuração inválida em `test/unit/environment.spec.ts`.
- [x] T009 [P] Criar testes unitários de timeout, circuit breaker, reconexão e sanitização de erro em `test/unit/redis.service.spec.ts`.
- [x] T010 [P] Criar teste de integração de conexão, TTL e shutdown com Redis real em `test/integration/redis.spec.ts`.

### Implementation

- [x] T011 Adicionar o cliente Redis aprovado e atualizar versões fixadas em `package.json` e `package-lock.json` (depende de T006).
- [x] T012 Adicionar Redis local com healthcheck, limite de memória e política de eviction de teste em `docker-compose.yml`.
- [x] T013 Adicionar configurações Redis, timeouts, prefixo por ambiente e feature flags em `src/config/environment.ts` e placeholders seguros em `.env.example`.
- [x] T014 Criar tipos/tokens de injeção independentes do SDK em `src/common/redis/redis.types.ts`.
- [x] T015 Implementar conexão única por processo, timeout, backoff, circuit breaker e shutdown em `src/common/redis/redis.service.ts`.
- [x] T016 Registrar e exportar a infraestrutura Redis em `src/common/redis/redis.module.ts` e `src/app.module.ts`.
- [x] T017 Adicionar logs estruturados e sanitizados de conexão, latência, timeout, erro e circuito em `src/common/redis/redis.service.ts`.
- [x] T018 Executar T008–T010 e validar início da aplicação com `REDIS_ENABLED=true` e `false`, registrando os comandos em `specs/005-api-protection-cache-proxy/quickstart.md`.

**Checkpoint D1:** Redis pode ser habilitado/desabilitado, falha de forma conhecida, encerra corretamente e não muda respostas da API.

---

## Phase 3: User Story 1 — Limite consistente entre réplicas (Priority: P1) 🎯 MVP de proteção

**Goal:** impedir que a adição de réplicas multiplique o limite permitido para o mesmo cliente.

**Independent Test:** duas instâncias da aplicação conectadas ao mesmo Redis recebem chamadas alternadas do mesmo IP; a soma respeita um único limite e retorna os mesmos headers/status do contrato atual.

### Tests

- [x] T019 [P] [US1] Escrever testes unitários do algoritmo, fronteiras de janela, TTL, hash de chave e concorrência em `test/unit/redis-rate-limit.store.spec.ts`.
- [x] T020 [P] [US1] Atualizar testes do middleware para modos enforce, observe e fallback em `test/unit/rate-limit.middleware.spec.ts`.
- [x] T021 [P] [US1] Criar teste de integração concorrente com duas instâncias e um Redis em `test/integration/distributed-rate-limit.spec.ts`.
- [x] T022 [P] [US1] Preservar status, corpo, `Retry-After` e `RateLimit-*` em `test/contract/public-api.spec.ts`.

### Implementation

- [x] T023 [US1] Criar contrato e store Redis atômico com TTL obrigatório em `src/common/http/redis-rate-limit.store.ts`.
- [x] T024 [US1] Criar políticas configuráveis por grupo de rota em `src/common/http/rate-limit.policy.ts`.
- [x] T025 [US1] Substituir o estado `Map` pela store injetada e implementar modos observe/enforce/fallback em `src/common/http/rate-limit.middleware.ts`.
- [x] T026 [US1] Resolver IP somente após configuração explícita de proxy confiável em `src/bootstrap.ts` e `src/config/environment.ts`.
- [x] T027 [US1] Garantir chaves compactas, com hash de identificador, namespace de ambiente e proteção contra cardinalidade em `src/common/http/redis-rate-limit.store.ts`.
- [x] T028 [US1] Registrar provider/políticas no módulo HTTP e composição de middlewares em `src/common/http/http.module.ts` e `src/app.module.ts`.
- [x] T029 [US1] Remover o fallback em memória da configuração final após T021 passar, mantendo rollback por feature flag documentado em `specs/005-api-protection-cache-proxy/quickstart.md`.

**Checkpoint D2:** o limite é atômico e compartilhado, o contrato `429` permanece compatível e falha Redis segue a política aprovada.

---

## Phase 4: User Story 2 — Leituras repetidas sem nova carga no banco (Priority: P1)

**Goal:** responder consultas públicas repetidas a partir do Redis, sem servir erros ou releases antigos como atuais.

**Independent Test:** após uma primeira chamada elegível, a mesma consulta canônica retorna o mesmo DTO sem executar nova query; publicar ou restaurar outro release muda o namespace e a próxima resposta reflete o release vigente.

### Tests

- [x] T030 [P] [US2] Criar testes de canonicalização, hash estável, versão e isolamento por ambiente em `test/unit/cache-key.spec.ts`.
- [x] T031 [P] [US2] Criar testes de TTL com jitter, tamanho máximo, serialização e rejeição de erro em `test/unit/redis-cache.service.spec.ts`.
- [x] T032 [P] [US2] Criar testes de single-flight/lock curto, timeout e recuperação de lock órfão em `test/unit/cache-stampede.spec.ts`.
- [x] T033 [P] [US2] Criar teste de integração de hit/miss/expiração/falha Redis com PostgreSQL real em `test/integration/response-cache.spec.ts`.
- [x] T034 [P] [US2] Criar teste de integração de publicação e rollback sem dados antigos no namespace vigente em `test/integration/cache-release-version.spec.ts`.
- [x] T035 [P] [US2] Confirmar igualdade de corpo, ordenação, status e headers com e sem cache em `test/contract/public-api.spec.ts`.

### Implementation

- [x] T036 [US2] Implementar query canônica, hash e namespaces versionados em `src/common/cache/cache-key.ts`.
- [x] T037 [US2] Implementar get/set com TTL, jitter, limite de bytes e falha tratada como miss em `src/common/cache/redis-cache.service.ts`.
- [x] T038 [US2] Implementar proteção contra stampede com espera limitada e liberação segura em `src/common/cache/cache-stampede.service.ts`.
- [x] T039 [US2] Registrar serviços, tokens e feature flags em `src/common/cache/cache.module.ts`, `src/app.module.ts` e `src/config/environment.ts`.
- [x] T040 [US2] Integrar cache allow-listed em `src/modules/countries/countries.service.ts`, `src/modules/countries/services/country-detail.service.ts`, `src/modules/statistics/statistics.service.ts`, `src/modules/statistics/services/timeseries.service.ts` e `src/modules/statistics/services/default-filters.service.ts`.
- [x] T041 [US2] Expor identidade do release publicado para composição das chaves sem usar varredura Redis em `src/modules/statistics/services/published-release-version.service.ts` e módulos consumidores.
- [x] T042 [US2] Preservar política HTTP e adicionar ETag somente se aprovado no contrato em `src/common/http/cache-control.interceptor.ts`.
- [x] T043 [US2] Registrar hit, miss, bypass, oversize, erro, bytes e latência sem labels de alta cardinalidade em `src/common/cache/redis-cache.service.ts`.

**Checkpoint D3:** somente respostas elegíveis entram no cache, hits evitam PostgreSQL e mudanças de release ficam visíveis imediatamente pelo novo namespace.

---

## Phase 5: User Story 3 — Entrada única, endurecida e balanceada (Priority: P1)

**Goal:** expor somente Nginx, absorver bursts e distribuir requisições entre pelo menos duas réplicas stateless.

**Independent Test:** chamadas ao endereço público alternam entre réplicas saudáveis; portas NestJS não são públicas; métodos/requests inválidos são rejeitados; remover uma réplica não interrompe as demais.

### Tests

- [ ] T044 [P] [US3] Criar script de validação sintática e invariantes da configuração Nginx em `scripts/validate-nginx.mjs`.
- [ ] T045 [P] [US3] Criar teste de topologia para distribuição, falha passiva e recuperação de upstream em `test/integration/nginx-load-balancing.spec.ts`.
- [ ] T046 [P] [US3] Criar casos de spoof de IP, método proibido, burst, URI/header grande e porta privada em `test/security/nginx-boundary.spec.ts`.

### Implementation

- [ ] T047 [US3] Criar configuração base com usuário não privilegiado, logs, limites e ocultação de versão em `deploy/nginx/nginx.conf`.
- [ ] T048 [US3] Configurar upstream round-robin, keep-alive, timeouts e falha passiva em `deploy/nginx/conf.d/visa-atlas.conf`.
- [ ] T049 [US3] Configurar `limit_req` por IP e virtual host, burst e resposta `429` em `deploy/nginx/conf.d/visa-atlas.conf`.
- [ ] T050 [US3] Permitir somente métodos aprovados e limitar corpo, URI e headers em `deploy/nginx/conf.d/visa-atlas.conf`.
- [ ] T051 [US3] Sobrescrever/propagar headers de proxy e correlation ID de forma controlada em `deploy/nginx/conf.d/visa-atlas.conf`.
- [ ] T052 [US3] Adicionar imagem/configuração Nginx, Redis e duas réplicas API à topologia local em `docker-compose.yml` e criar `Dockerfile` para a API se necessário.
- [ ] T053 [US3] Remover publicação externa das portas das réplicas e manter somente Nginx exposto em `docker-compose.yml`.
- [ ] T054 [US3] Documentar terminação TLS, certificados, rede privada e diferenças entre desenvolvimento/produção em `specs/005-api-protection-cache-proxy/quickstart.md`.
- [ ] T055 [US3] Adicionar `nginx:validate` e o teste de topologia aos scripts de verificação em `package.json`.

**Checkpoint D4:** Nginx é a única entrada pública, o IP real é confiável, bursts recebem `429` e a carga é distribuída sem sticky session.

---

## Phase 6: User Story 4 — Degradação segura e proteção do PostgreSQL (Priority: P2)

**Goal:** manter o sistema controlado quando Redis falhar, o cache estiver frio ou o banco estiver próximo da saturação.

**Independent Test:** com Redis indisponível e carga limitada pelo Nginx, a aplicação continua correta, respeita pool/timeouts/backpressure e retorna `503` seguro quando não há capacidade.

### Tests

- [ ] T056 [P] [US4] Criar testes de configuração de pool, timeout e orçamento global por réplica em `test/unit/database-safety.spec.ts`.
- [ ] T057 [P] [US4] Criar teste de integração com Redis indisponível e PostgreSQL real em `test/integration/degraded-read-path.spec.ts`.
- [ ] T058 [P] [US4] Criar teste de saturação/backpressure e resposta `503` segura em `test/integration/database-backpressure.spec.ts`.
- [ ] T059 [P] [US4] Validar piores filtros permitidos e planos de execução em `test/performance/query-plans.spec.ts`.

### Implementation

- [ ] T060 [US4] Adicionar limites validados de pool, aquisição e statement timeout em `src/config/environment.ts` e `src/common/database/prisma.service.ts`.
- [ ] T061 [US4] Implementar limite de concorrência para leituras caras em `src/common/database/query-concurrency.service.ts` e registrar em `src/common/database/database.module.ts`.
- [ ] T062 [US4] Mapear saturação/timeout para erro `503` sanitizado em `src/common/errors/api-exception.filter.ts` e `src/common/errors/domain.error.ts`.
- [ ] T063 [US4] Revisar paginação, intervalos e limites de resposta em `src/common/dto/statistics-query.dto.ts`, `src/modules/countries/dto/list-countries-query.dto.ts` e contrato OpenAPI compartilhado quando necessário.

**Checkpoint D5:** falhas de cache/Redis não geram tempestade de queries, o banco tem orçamento global e saturação falha rapidamente com resposta segura.

---

## Phase 7: Validação integrada, segurança e carga

**Purpose:** comprovar o conjunto completo antes de qualquer rollout.

- [ ] T064 [P] Criar cenários cache frio, quente, hot key, muitas chaves, burst por IP, múltiplos IPs e Redis offline em `test/load/api-protection.k6.js` ou ferramenta aprovada na T006.
- [ ] T065 [P] Criar teste de cardinalidade/memória de chaves e expiração obrigatória em `test/security/redis-keyspace.spec.ts`.
- [ ] T066 [P] Criar teste de não-cache de `4xx`, `5xx`, exceções e respostas acima do limite em `test/security/cache-eligibility.spec.ts`.
- [ ] T067 Executar teste integrado com Nginx, duas réplicas, Redis e PostgreSQL locais e registrar comandos/resultados em `specs/005-api-protection-cache-proxy/quickstart.md`.
- [ ] T068 Comparar resultados de carga com o baseline/SLO da T003 e registrar p50/p95/p99, hit ratio, queries, conexões, `429` e `5xx` em `specs/005-api-protection-cache-proxy/research.md`.
- [ ] T069 Executar `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build` e `npm run contract:validate` e registrar resultados em `specs/005-api-protection-cache-proxy/quickstart.md`.
- [ ] T070 Executar auditoria de dependências, revisar imagem Nginx/Redis fixada e documentar riscos aceitos em `specs/005-api-protection-cache-proxy/research.md`.
- [ ] T071 Ensaiar rollback independente de cache, rate limit Redis e Nginx e registrar tempos/passos em `docs/operations/api-protection-runbook.md`.
- [ ] T072 Revalidar Success Criteria e Constitution Check com evidências em `specs/005-api-protection-cache-proxy/plan.md`.

**Checkpoint D6:** comportamento funcional, segurança, falhas, carga e rollback possuem evidência reproduzível e atendem aos SLOs aprovados.

---

## Phase 8: Rollout e operação

**Purpose:** ativar gradualmente, observar custo e deixar resposta operacional pronta.

- [ ] T073 Criar runbook de Redis indisponível, cota esgotada, eviction anormal, cache inconsistente, upstream falho, rotação de credencial e rollback em `docs/operations/api-protection-runbook.md`.
- [ ] T074 [P] Documentar dashboards e alertas para `429`, `5xx`, p95/p99, hit ratio, erros Redis, memória/comandos/evictions, queries e conexões em `docs/operations/api-protection-observability.md`.
- [ ] T075 [P] Documentar alertas de 70%, 85% e 95% das cotas do provedor e ação correspondente em `docs/operations/api-protection-observability.md`.
- [ ] T076 Criar checklist de rollout: conexão Redis inativa, rate limit observe, enforce, cache por endpoint, Nginx com uma réplica, múltiplas réplicas e bloqueio do acesso direto em `docs/operations/api-protection-rollout.md`.
- [ ] T077 Executar smoke test pequeno no Redis gerenciado sem usar dados/credenciais de produção e registrar somente métricas sanitizadas em `docs/operations/api-protection-rollout.md`.
- [ ] T078 Executar rollout gradual conforme T076, interrompendo automaticamente em regressão de SLO, contrato, erro ou cota, e registrar o resultado em `docs/operations/api-protection-rollout.md`.
- [ ] T079 Revisar limites após o período de observação e versionar os valores aprovados em `src/config/environment.ts`, `.env.example` e `docs/operations/api-protection-rollout.md`.

**Checkpoint D7:** tráfego real passa somente pelo Nginx, proteções estão ativas, cotas são observáveis e a equipe possui procedimento testado de incidente/rollback.

---

## Dependencies & Execution Order

### Deliverable dependencies

```text
D0 Decisions/Baseline
        |
        v
D1 Redis Foundation
   |            |                         D0
   v            v                          |
D2 Rate      D3 Cache                      v
   |            |                    D4 Nginx/Replicas
   +------.-----+--------------------------+
          v
    D5 DB Resilience
          |
          v
    D6 Integrated Validation
          |
          v
    D7 Rollout/Operations
```

- D0 bloqueia instalação de dependência e configuração definitiva.
- D1 bloqueia D2 e D3.
- D2 e D3 podem avançar em paralelo após D1, evitando edição simultânea de `src/app.module.ts` e `src/config/environment.ts`.
- D4 pode começar após D0 e avançar em paralelo com D1–D3; sua validação final depende de ao menos duas réplicas executáveis.
- D5 depende das políticas de fallback de D2/D3 e dos limites externos de D4.
- D6 depende de D2–D5.
- D7 depende de D6 aprovado.

### Critical path

`T001–T007 -> T011–T018 -> T023–T029 + T036–T043 -> T060–T063 -> T067–T072 -> T076–T079`

### Safe parallel work

- T004 e T005 podem avançar enquanto T002/T003 medem o estado atual.
- T008–T010 podem ser escritos em paralelo antes da implementação Redis.
- Após D1, os testes/implementação de US1 e US2 podem ser divididos entre responsáveis diferentes.
- T044–T046 e T047–T051 podem avançar sem tocar nos serviços de domínio.
- T064–T066 podem ser preparados em paralelo depois que os contratos técnicos estiverem estáveis.
- T074/T075 podem ser produzidas em paralelo com o ensaio de rollback T071.

## Implementation Strategy

### Primeiro incremento utilizável

1. Concluir D0 e D1.
2. Entregar D2 com uma única instância e Redis compartilhado.
3. Validar duas instâncias sem Nginx no teste de integração.
4. Entregar D4 para tornar Nginx a entrada única.
5. Ativar somente rate limit; cache permanece desligado por feature flag.

Esse incremento já impede que réplicas multipliquem o limite e reduz exposição direta, sem alterar o caminho de dados.

### Segundo incremento

1. Entregar D3 endpoint por endpoint.
2. Começar por `filters/defaults` e catálogo, depois mapa, detalhe e série histórica.
3. Medir hit ratio, comandos Redis e redução de queries antes de habilitar o próximo endpoint.
4. Manter rollback por feature flag independente do rate limit.

### Terceiro incremento

1. Entregar D5 e executar D6 completo.
2. Ensaiar indisponibilidade Redis/PostgreSQL/upstream.
3. Executar D7 gradualmente com stop conditions explícitas.

## Definition of Done

- Todas as tarefas do entregável estão concluídas e revisadas.
- Testes relevantes foram escritos antes ou junto da implementação e executados em ambiente isolado.
- Nenhum segredo, URL com credencial ou dado sensível aparece em código, logs, fixtures ou documentação.
- Contrato HTTP permanece compatível ou foi atualizado/aprovado antes da implementação.
- O resultado inclui evidência de comportamento com duas réplicas, Redis real, PostgreSQL real e Nginx real.
- Falha Redis, cache frio e saturação do banco possuem comportamento conhecido e testado.
- O entregável possui rollback documentado e não depende de alteração manual não registrada.
