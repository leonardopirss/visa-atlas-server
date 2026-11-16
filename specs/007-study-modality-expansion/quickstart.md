# Quickstart: validar Modalidade Estudo

## 1. Contrato e migration

1. Confirmar que os dois OpenAPI são idênticos.
2. Gerar contratos do frontend.
3. Aplicar migration em banco de teste vazio.
4. Confirmar que `WORK` continua válido e `STUDY` é aceito.

## 2. Europa P1

1. Carregar fixture estrutural Eurostat com `EMP` e `EDUC`.
2. Rodar ingestão de Estudo duas vezes e confirmar idempotência.
3. Consultar mapa, detalhe e série com `purpose=STUDY`.
4. Confirmar que a mesma consulta com `purpose=WORK` mantém valores anteriores.
5. No frontend, alternar Trabalho → Estudo e verificar limpeza de ano/grupo.
6. Executar Playwright contra backend e banco reais de teste, sem mock das rotas Visa Atlas.

## 3. Reino Unido P2

Validado com `Edu_D01/Data_Edu_D01`, Brasil, anos completos e métrica `APPLICATIONS_RECEIVED`. O snapshot de estudo usa dataset próprio e não despublica `Occ_D02/WORK`.

## 4. Canadá P3

Validado com o workbook anual por cidadania, métrica `VALID_PERMIT_HOLDERS`, estoque em 31 de dezembro e tratamento de supressão/arredondamento. O snapshot de estudo usa dataset próprio e não despublica IMP/WORK.

## Quality gates por fase

- Backend: format, lint, typecheck, unit, integration, contract e build.
- Frontend: format, lint, typecheck, Vitest, build e Playwright real.
- Revisão manual: rótulo do evento, unidade, período, fonte e ausência de ranking incompatível.

## Evidências em 2026-11-16

- Contratos OpenAPI sincronizados byte a byte e geração do frontend concluída.
- Backend: typecheck e lint verdes; suites unitárias e integrações regionais verdes no schema isolado `visa_atlas_test`.
- Admission gates reais: Eurostat `migr_resedu`, Home Office `Edu_D01` (49 observações, 2018–2025) e IRCC Study (25 observações, 2000–2024).
- Frontend: 68 testes Vitest verdes; Playwright real com API e PostgreSQL locais, 6/6 cenários verdes.
- Tooltip do histórico validado por hover no ano anterior, com valor em branco; indicador `Todos os países` e finalidade `Estudo` validados no fluxo real.
- Limitação local externa à feature: `prisma migrate deploy` completo permanece bloqueado pela pasta preexistente `20261116010000_lock_supabase_access_to_api`, que não possui `migration.sql`. A migration desta feature foi validada pela geração Prisma e por `db push` no schema isolado, sem alterar a pasta alheia.
