# Research: Proteção da API, cache Redis e proxy Nginx

**Feature:** `005-api-protection-cache-proxy`  
**Date:** 2026-10-31  
**Status:** Phase 1 decision record

## 1. Current-State Inventory

### Request path

O estado atual possui uma única aplicação NestJS exposta diretamente, PostgreSQL como persistência, `helmet`, validação global, CORS allow-listed, cache HTTP via `Cache-Control` e rate limit em `Map` local por processo.

```text
cliente -> NestJS -> PostgreSQL
             |
             +-> Map local de rate limit
```

Limitações confirmadas:

- o contador local é multiplicado pelo número de réplicas;
- reinício limpa todos os contadores;
- cache HTTP reduz chamadas apenas quando cliente/CDN o respeita; o servidor não possui cache compartilhado;
- `CORS_ORIGINS` não impede bots, servidores ou `curl`;
- confiança de proxy ainda não está configurada;
- não há Nginx ou isolamento de porta no Compose atual.

### Endpoint cost inventory

Contagens de queries abaixo são derivadas do caminho de código com release publicado e não incluem queries de bootstrap/sincronização do catálogo.

| Endpoint                            | Queries típicas | Resposta baseline | Custo/cardinalidade                            | Cacheability                           |
| ----------------------------------- | --------------: | ----------------: | ---------------------------------------------- | -------------------------------------- |
| `GET /filters/defaults`             |               1 |             174 B | Um grupo publicado mais recente                | Alta; versão de release                |
| `GET /countries?page=1&pageSize=30` |               2 |           1.991 B | Lista + count; busca/página multiplicam chaves | Alta com limite de cardinalidade       |
| `GET /stats/map`                    |               3 |          56.933 B | Grupo + 249 países + observações               | Muito alta; endpoint mais caro/pesado  |
| `GET /countries/ESP`                |               5 |           1.852 B | País, grupo, observações, programas e links    | Alta; chave por país/filtro/release    |
| `GET /countries/ESP/timeseries`     |               3 |             686 B | País, grupos comparáveis e observações         | Alta; chave por país/intervalo/release |

Limites já presentes:

- `pageSize <= 100`;
- busca de catálogo com no máximo 100 caracteres;
- `comparisonGroupId` com no máximo 200 caracteres;
- anos inteiros a partir de 1900;
- queries Prisma parametrizadas;
- índices para grupo/destino, destino/período e cobertura publicada.

## 2. Local Baseline

### Method

- API compilada em modo de produção, sem Nginx e sem Redis.
- PostgreSQL temporário e isolado em `/tmp`, removido após a medição.
- Schema de teste com migrações reais.
- Fixture sintética existente seguida da sincronização do catálogo.
- Dataset: 249 países, 3 observações, 1 comparison group, 1 release publicado e 2 programas.
- Ambiente: macOS 26.6.1 arm64, Node.js 26.11.1, PostgreSQL 15.19.
- Rate limit elevado apenas no processo temporário para não interferir no benchmark.
- Medição sequencial: primeira chamada por rota e 50 repetições com `curl`.
- Throughput: ApacheBench, 500 requests por rota, concorrência 10.
- Respostas não comprimidas; rede loopback.

### Sequential results

| Endpoint           | Primeira chamada |  Bytes | Warm mean | Warm p50 | Warm p95 | Warm p99 |
| ------------------ | ---------------: | -----: | --------: | -------: | -------: | -------: |
| filters/defaults   |        30,975 ms |    174 |  1,226 ms | 1,125 ms | 1,760 ms | 1,890 ms |
| countries list     |         5,619 ms |  1.991 |  1,634 ms | 1,370 ms | 2,394 ms | 4,407 ms |
| stats/map          |         5,721 ms | 56.933 |  2,832 ms | 2,806 ms | 3,148 ms | 3,267 ms |
| country detail     |         4,829 ms |  1.852 |  2,546 ms | 2,457 ms | 2,998 ms | 3,621 ms |
| country timeseries |         2,888 ms |    686 |  1,963 ms | 1,860 ms | 2,453 ms | 2,599 ms |

### Concurrent results

| Endpoint           | Requests/s | Mean request | Failed requests |
| ------------------ | ---------: | -----------: | --------------: |
| filters/defaults   |   2.921,57 |     3,423 ms |               0 |
| countries list     |   4.398,31 |     2,274 ms |               0 |
| stats/map          |   1.556,23 |     6,426 ms |               0 |
| country detail     |   1.700,63 |     5,880 ms |               0 |
| country timeseries |   2.751,44 |     3,634 ms |               0 |

### Interpretation

Este é um baseline de regressão local, não uma promessa de capacidade de produção. Loopback, banco local, fixture pequena e ausência de TLS/proxy reduzem latência artificialmente. `/stats/map` é o primeiro candidato de cache pelo maior payload e menor throughput; country detail é o caminho com mais queries. A Fase 6 deverá repetir a medição na topologia final e no tamanho real do dataset.

## 3. Free Redis Provider Comparison

Dados consultados em documentação oficial em 2026-10-31.

| Criterion        | Upstash Free                                                             | Redis Cloud Essentials Free                               |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Preço            | US$ 0                                                                    | US$ 0                                                     |
| Memória/dados    | 256 MB                                                                   | 30 MB                                                     |
| Comandos         | 500 mil/mês                                                              | Limite não expresso como cota mensal na página consultada |
| Banda            | 10 GB/mês                                                                | Limitada pelo plano, sem valor claro na página consultada |
| Conexões         | Não identificado como limite baixo na tabela Free                        | 30 conexões concorrentes                                  |
| TLS no Free      | Sempre habilitado                                                        | Não disponível no Free                                    |
| Protocolo        | Redis TCP e HTTPS REST; EVAL suportado                                   | Redis nativo                                              |
| Região São Paulo | Disponível em AWS `sa-east-1`                                            | Essentials disponível em AWS/GCP São Paulo                |
| Eviction         | `optimistic-volatile`, opcional; writes falham no limite se desabilitada | Políticas configuráveis, default `volatile-lru`           |
| SLA/HA avançada  | Não incluído no Free; Prod Pack pago                                     | Best-effort no Free                                       |
| Backup/export    | Recursos avançados pagos                                                 | Free sem backup/export pelo console                       |

### Decision: Upstash Free, conditionally approved for MVP

Motivos:

1. TLS é obrigatório para conexão pública e está disponível no plano gratuito Upstash.
2. 256 MB fornece margem maior para cache descartável e contadores.
3. Redis TCP nativo e EVAL permitem usar o cliente oficial sem acoplamento ao SDK REST.
4. São Paulo está disponível; a região final deve ser igual à região do backend.

Condições:

- usar `rediss://` e secret manager;
- armazenar somente dados públicos reconstruíveis e identificadores HMAC de IP;
- habilitar eviction e TTL em todas as chaves;
- aceitar que Free não possui SLA, ACL avançada, criptografia at-rest/monitoramento avançado equivalentes aos add-ons pagos;
- migrar/upgrade antes de tráfego ou criticidade incompatível com o plano;
- confirmar no console as cotas vigentes antes do provisionamento, porque preços/limites podem mudar.

Redis Cloud Free foi rejeitado para produção desta entrega porque a documentação declara que TLS não está disponível no plano Free. Permanece válido para aprendizado local, não para tráfego público fora de rede privada.

### Command budget

Upstash Free informa 500.000 comandos/mês:

- 16.667 comandos/dia em um mês de 30 dias;
- aproximadamente 0,193 comando/s em média mensal;
- um request cacheável consome normalmente 1 EVAL de rate limit + 1 GET de cache;
- nesse caminho, o teto teórico é 250.000 requests/mês antes de misses, SETs, locks e margem;
- reservando 10% para misses/operação, o orçamento inicial é no máximo 225.000 requests/mês, sujeito ao mix real.

Conclusão: Free atende MVP de baixo tráfego, mas não é uma solução gratuita de alta escala. Alertas entram em 350 mil, 425 mil e 475 mil comandos (70/85/95%). Em 85%, congelar expansão do cache e decidir upgrade; em 95%, preparar desativação seletiva/fallback antes de bloqueio do provedor.

## 4. Rate Limit Decision

### Algorithm: GCRA in one atomic EVAL

Escolhido sobre fixed window e sliding log:

- suaviza burst sem armazenar cada timestamp;
- usa estado compacto com TTL;
- EVAL mantém decisão global/rota/cota longa atômica;
- evita race condition entre `INCR` e `EXPIRE`;
- uma chamada Redis por request pode avaliar múltiplas políticas.

Políticas iniciais:

| Layer               | Policy              | Rationale                                                                |
| ------------------- | ------------------- | ------------------------------------------------------------------------ |
| Nginx per IP        | 5 req/s, burst 10   | Absorver pico antes de Node/Redis e permitir carregamento inicial do app |
| Nginx virtual host  | 100 req/s, burst 50 | Guardrail provisório; recalibrar no deploy                               |
| Redis global per IP | 120 req/min         | Preserva o contrato atual como limite sustentado                         |
| Redis heavy group   | 60 req/min          | Protege mapa, detalhe e timeseries                                       |
| Redis daily per IP  | 1.000 req/day       | Limita um único cliente sem consumir parcela excessiva do free tier      |

As políticas iniciam em observe. NAT compartilhado é o principal risco de falso positivo. Sem autenticação, não há identidade melhor que IP; futura API key/conta deverá substituir ou complementar essa dimensão.

### Identity and keys

- normalizar IPv4/IPv6 após cadeia de proxy confiável;
- derivar `HMAC-SHA-256(secret, normalizedIp)` e truncar para identificador fixo adequado;
- nunca armazenar IP bruto;
- prefixo `visa:<environment>:ratelimit:<policyVersion>:<identity>`;
- TTL máximo igual à janela/cota aplicável mais margem pequena;
- rotação do segredo aceita reset controlado de contadores e deve ocorrer via runbook.

### Failure policy

- Redis command timeout inicial: 250 ms.
- Offline queue desabilitada.
- Circuit breaker abre após falhas consecutivas e tenta recuperação com backoff/jitter.
- Rate limit Redis: fail-open porque Nginx permanece limitando; registrar métrica/alerta.
- Eventual endpoint autenticado/sensível deverá revisar para fail-closed.

## 5. Redis Client Decision

### Client: official `redis` / node-redis

Motivos:

- recomendado pela documentação oficial para Node.js;
- Redis TCP padrão mantém portabilidade entre Upstash, Redis local e provedor futuro;
- suporta TLS por URL, EVAL, reconexão configurável, eventos e AbortSignal por comando;
- adequado ao processo NestJS de longa duração; não há necessidade do SDK HTTP serverless.

Configuração inicial:

- um cliente compartilhado por processo;
- `rediss://` em ambientes remotos e `redis://` somente na rede local de teste;
- `connectTimeout` de 1 s e command timeout de 250 ms;
- `disableOfflineQueue: true`;
- listener de erro obrigatório com sanitização;
- backoff exponencial com jitter e teto;
- shutdown via lifecycle hook NestJS.

## 6. Cache Decision

### Strategy

- cache-aside no backend;
- allow-list explícita dos cinco GETs;
- somente DTO final `2xx` completo;
- namespace com versão de contrato e release;
- query validada/canônica antes do hash;
- TTL + jitter de 10%; máximo inicial 128 KiB por item;
- falha/eviction é miss;
- sem Nginx `proxy_cache` na primeira entrega.

### Initial TTLs

| Endpoint group         |    TTL |
| ---------------------- | -----: |
| defaults               |  5 min |
| country catalog/search |    6 h |
| map                    | 15 min |
| detail                 | 15 min |
| timeseries             | 30 min |

Todos os valores serão revisados por hit ratio e cota. Cache de pesquisa pode gerar alta cardinalidade; somente queries validadas, chaves compactas e limite operacional de itens/bytes serão aceitos.

### Stampede

Usar single-flight local para chamadas concorrentes na mesma réplica e lock Redis curto somente para chaves quentes compartilhadas. O lock possui token de dono, TTL curto e liberação compare-and-delete. Se expirar, o request não espera indefinidamente; segue orçamento do banco/backpressure.

## 7. SLOs and Capacity Gates

Metas iniciais aprovadas:

- disponibilidade mensal de 99,5% para o MVP gratuito, sem alegar SLA do provedor;
- p95 de cache hit < 100 ms no ambiente alvo sob carga nominal;
- p99 geral < 500 ms para leituras normais sob carga nominal;
- cache hit ratio >= 80% após sete dias de tráfego estável;
- redução >= 70% de queries no workload repetido após aquecimento;
- timeout Redis <= 250 ms sem offline queue;
- zero `5xx` inesperado no teste nominal;
- zero divergência de contrato com cache ligado/desligado;
- `503` controlado sob saturação, nunca espera ilimitada.

Gates antes de produção:

1. repetir baseline na topologia Nginx + 2 réplicas + Redis + PostgreSQL;
2. medir latência real entre backend e região Redis escolhida;
3. provar que duas réplicas compartilham limite atômico;
4. provar ausência de query de domínio em cache hit;
5. testar Redis offline e cota/erro simulados;
6. confirmar pool PostgreSQL total considerando todas as réplicas;
7. obter aprovação explícita do destino de rollout.

## 8. Source Links

- Upstash pricing and free limits: <https://upstash.com/pricing/redis>
- Upstash security/TLS: <https://upstash.com/docs/redis/features/security>
- Upstash eviction: <https://upstash.com/docs/redis/features/eviction>
- Upstash protocol compatibility: <https://upstash.com/docs/redis/overall/compatibility>
- Upstash São Paulo region: <https://upstash.com/docs/redis/features/globaldatabase>
- Redis Cloud free limits: <https://redis.io/docs/latest/operate/rc/subscriptions/>
- Redis Cloud free database: <https://redis.io/docs/latest/operate/rc/databases/create-database/create-free-database/>
- Redis Cloud TLS restriction: <https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/>
- Redis Cloud regions: <https://redis.io/docs/latest/operate/rc/supported-regions/>
- node-redis guide: <https://redis.io/docs/latest/develop/clients/nodejs/>
- node-redis production usage: <https://redis.io/docs/latest/develop/clients/nodejs/produsage/>
