# Quickstart de validação: Visa Decision Insights

Este documento será preenchido durante a implementação; não contém números de
produção nem afirma que uma fonte foi admitida.

## Gate 1 — contrato

- [ ] OpenAPI canônico e espelho são idênticos.
- [ ] Tipos gerados compilam sem casts inseguros.
- [ ] Consumidores do payload anterior continuam passando.

## Gate 2 — derivação

- [ ] Fixture sintética compatível publica taxa com linhagem.
- [ ] Denominador zero, numerador maior e dimensões divergentes são rejeitados.
- [ ] Reexecução é idempotente e falha preserva o snapshot anterior.

## Gate 3 — processamento e backlog

- [ ] Mediana, P90, meta e pendente usam rótulos/unidades distintos.
- [ ] Scope nacional não aparece como cidadania brasileira.
- [ ] Histórico preserva revisão, supressão e freshness.

## Gate 4 — requisitos

- [ ] Moeda, base, vigência, condição e fonte são exibidas.
- [ ] Ausência não vira zero, `NO` nem texto inventado.
- [ ] Versões históricas não são sobrescritas.

## Gate 5 — integração real

- [ ] Backend e PostgreSQL de teste executados com dados isolados.
- [ ] Playwright usa as rotas reais sob validação, sem interceptá-las.
- [ ] Desktop, mobile, teclado, ausência e erro foram verificados.

## Evidence log

Registrar comandos, versões, data, resultado e limitações somente após execução.

### 2026-11-16 — Fundação de contrato e dados (VDI-T018, parcial)

- `npm run contract:validate` (backend): passou; OpenAPI 3.1 válido.
- `shasum -a 256` e `cmp` entre contrato canônico e espelho: passaram; SHA-256
  `3322fac4c96982f82a8d7a016053a6117d0520fbf2ed001dd4260502e2e8f643`.
- `npm run typecheck` (backend e frontend): passou nos dois repositórios.
- Vitest direcionado de validação e client: 17/17 testes passaram.
- Jest de schema/migration no PostgreSQL `public_test`: 5/5 testes passaram;
  `prisma migrate deploy` informou nenhuma migration pendente.
- Asserções OpenAPI independentes de banco: 6/6 passaram.
- Gate integrado HTTP ainda pendente: execuções concorrentes anteriores esgotaram
  temporariamente o pool remoto (`connection limit: 5`, `pool timeout: 2`). Repetir
  isoladamente antes de concluir VDI-T018; não houve falha de asserção de contrato.

Reexecução posterior do gate de fundação:

- OpenAPI canônico e espelho permaneceram byte a byte idênticos, SHA-256
  `3322fac4c96982f82a8d7a016053a6117d0520fbf2ed001dd4260502e2e8f643`.
- `prisma validate`, `prisma generate`, lint, typecheck e `git diff --check`
  passaram no backend.
- geração de contratos, lint, typecheck e 44 testes direcionados passaram no
  frontend. VDI-T018 concluída; o Playwright completo pertence a VDI-T032.

### 2026-11-19 — US1 decisões e taxas (VDI-T032, parcial)

- Testes puros backend de derivação, validator, adapter, runner e presenter:
  68/68 passaram; lint e typecheck passaram.
- Integração PostgreSQL de staging, derivação, linhagem, idempotência e rejeição:
  4/4 passaram contra `public_test`.
- Testes frontend direcionados de detalhe, filtros, histórico e comparação:
  21/21 passaram; lint e typecheck passaram.
- O seed E2E deriva e valida explicitamente o schema `public_test`; a fixture
  `Vis_D02_E2E_SYNTHETIC` contém 2024/2025 e é rotulada como não produtiva.
- O Playwright real descobriu o cenário, chamou a API sem interceptação e chegou
  a renderizar a taxa de 75,00%, fórmula e operandos em uma execução. O gate
  completo permanece pendente: o pooler remoto saturou nas consultas paralelas
  de cobertura (`database.query_rejected`, timeout de fila de 30 s). A tentativa
  de elevar temporariamente o backend de teste para três conexões não foi
  autorizada; nenhuma configuração de produção foi alterada.
