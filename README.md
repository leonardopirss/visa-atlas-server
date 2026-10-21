# Visa Atlas API

Backend NestJS 12 + TypeScript strict + PostgreSQL/Prisma para o recorte inicial de cidadania brasileira e finalidade de trabalho. O serviço expõe somente as cinco operações públicas definidas no OpenAPI compartilhado.

## Requisitos

- Node.js 24 LTS (o `package.json` também aceita Node 25/26 para validação antecipada)
- npm 11+
- Docker com Compose, ou PostgreSQL 15+

## Configuração local

```bash
cp .env.example .env
docker compose up -d postgres
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

A API fica em `http://localhost:3000/api/v1`. O banco inicia vazio intencionalmente: não há seed sintético em produção. A fixture em `test/fixtures/` declara no próprio conteúdo que é exclusivamente de teste.

## API pública

- `GET /api/v1/filters/defaults`
- `GET /api/v1/countries`
- `GET /api/v1/stats/map`
- `GET /api/v1/countries/:iso3`
- `GET /api/v1/countries/:iso3/timeseries`

Entradas são validadas em runtime. Erros têm `code`, `message` e `correlationId`; o header `x-correlation-id` é propagado ou gerado. As respostas públicas recebem cache HTTP curto e limite por IP. O limitador atual é por processo; uma implantação com várias réplicas deve trocar o armazenamento por um compartilhado sem mudar o contrato HTTP.

## Semântica estatística

- A consulta pública lê exclusivamente `DatasetRelease.status=PUBLISHED`.
- `value=0` representa zero observado. Ausência e supressão usam `value=null` com `UNAVAILABLE` ou `SUPPRESSED`.
- Métrica, unidade, período, cidadania, finalidade, grupo comparável, release e fonte acompanham a observação.
- `FIRST_RESIDENCE_PERMITS_GRANTED` não é apresentado como `WORK_VISAS_ISSUED`.
- Programas de visto só aparecem quando possuem `verifiedAt` e URL oficial.

## Ingestão

O módulo interno executa `adapt -> validate -> stage -> checksum/deduplicate -> publish`. Ele não possui rota pública. O adaptador JSON-stat do Eurostat recebe um mapeamento explícito das dimensões e códigos de trabalho; uma categoria não é inferida pelo nome.

`IngestionService.stage()` valida a unidade oficial `PER` (pessoa), período anual, cidadania `BRA`, finalidade normalizada `WORK`, categoria original `EMP`, métrica permitida, valor e status. Releases inválidos ficam `REJECTED`. `PublishReleaseService.publish()` promove uma release verificada e rebaixa a publicação anterior na mesma transação. Se qualquer etapa falhar, o snapshot publicado anterior continua disponível. `rollbackTo()` executa a promoção lógica de uma release anteriormente verificada.

Para buscar, validar e publicar o recorte oficial de primeiras autorizações de residência por motivo de emprego para cidadãos brasileiros:

```bash
npm run ingest:eurostat
```

O job é interno, consulta a API Statistics do Eurostat com timeout e limite de resposta, sincroniza apenas os países reportantes do recorte, preserva o payload por checksum e publica a release atomicamente. A repetição do comando é idempotente.

## Qualidade

Com PostgreSQL de teste disponível em `DATABASE_URL`:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

A suíte cobre contrato HTTP, zero versus ausência/supressão, filtros padrão, detalhes, fontes, programas verificados, série comparável, adaptação Eurostat, idempotência, rejeição semântica, publicação atômica e presença/execução dos índices críticos.

## Contrato compartilhado

A fonte de verdade permanece em `visa-atlas-client/specs/001-shared-api-contract/contracts/openapi.yaml`. O arquivo `contracts/openapi.yaml` deste repositório é um snapshot versionado para permitir testes e CI isolados; mudanças contratuais devem nascer no client e ser sincronizadas aqui. Em 20/10/2026, a validação OpenAPI 3.1 identifica uma propriedade YAML acidental em `components.parameters.YearOptional`, causada pela descrição inline não delimitada após uma vírgula. Além disso, o gate SH-T011 ainda não possui `decision.md`. Por isso, a aprovação/validação formal do contrato permanece uma pendência, embora os cinco handlers e seus testes de comportamento estejam implementados.

O problema pode ser reproduzido com `npm run contract:validate`. Após a correção/aprovação no spec-kit, esse comando deve entrar no gate obrigatório da CI.
