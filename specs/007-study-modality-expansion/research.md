# Research: Modalidade Estudo

**Date:** 2026-11-16

## Decision 1 — Europa

**Status:** ACCEPTED para P1.

- **Órgão:** Eurostat.
- **Fonte primária:** `migr_resedu`, API de disseminação Eurostat.
- **Recorte:** `freq=A`, `unit=PER`, `duration=TOTAL`, `citizen=BR`, destinos europeus aprovados e categoria educacional oficial.
- **Evento:** primeiras autorizações de residência emitidas por motivo de educação.
- **Métrica:** `FIRST_RESIDENCE_PERMITS_GRANTED`.
- **Finalidade:** `STUDY`.
- **Categoria original:** `EDUC`.
- **Frequência/período:** anual; cobertura pública atualmente inclui 2008–2025.
- **URLs:**
  - https://ec.europa.eu/eurostat/databrowser/view/migr_resfirst/default/table
  - https://ec.europa.eu/eurostat/databrowser/view/migr_resedu/default/table
  - https://ec.europa.eu/eurostat/cache/metadata/en/migr_res_esms.htm
- **Licença/reutilização:** política de reutilização Eurostat já adotada pelo projeto; manter atribuição e metodologia.
- **Decisão:** usar `migr_resedu` como `SourceDataset` separado. Reutilizar `migr_resfirst` faria a publicação de Estudo despublicar Trabalho, pois releases são promovidas atomicamente por dataset.

## Decision 2 — Reino Unido

**Status:** ACCEPTED e validado contra a release oficial de março de 2026.

- **Órgão:** UK Home Office.
- **Fonte primária:** Immigration system statistics data tables.
- **Tabela/worksheet:** `Edu_D01` / `Data_Edu_D01`.
- **Cabeçalhos:** `Year`, `Quarter`, `Nationality`, `Region`, `Visa type subgroup`, `Course level`, `Applications`.
- **Evento:** aplicações de entry clearance para estudo patrocinado; publicado como `APPLICATIONS_RECEIVED`, nunca como concessões.
- **Recorte:** `Nationality=Brazil`; subgrupos oficiais `Tier 4 - General Student` e `Student`; nível do curso preservado na categoria original.
- **Finalidade:** `STUDY`.
- **URL:** https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables
- **Frequência:** linhas trimestrais agregadas apenas quando Q1–Q4 do ano estão presentes. A release validada contém anos completos 2018–2025; 2026 Q1 é excluído.
- **Asset validado:** https://assets.publishing.service.gov.uk/media/6a05e19c5f39105e0848a2c3/education-visas-datasets-mar-2026.xlsx
- **Licença:** Open Government Licence v3.0.
- **Risco:** categoria Course level não equivale a um programa de visto; não inferir concessões a partir de aplicações.
- **Resultado do gate:** 18.720 linhas lidas, 49 observações anuais brasileiras e categorias reais aceitas; falha fechada para aba, cabeçalhos, subgrupo, trimestre, valor ou Brasil ausente.

## Decision 3 — Canadá

**Status:** ACCEPTED e validado contra o workbook oficial disponível em 2026-11-16.

- **Órgão:** Immigration, Refugees and Citizenship Canada (IRCC).
- **Fonte primária:** Temporary Residents: Study Permit Holders – Monthly IRCC Updates.
- **Dataset preferido:** Study permit holders on December 31st by country of citizenship.
- **Evento:** titulares com permissão de estudo válida no fim do ano.
- **Métrica:** `VALID_PERMIT_HOLDERS`.
- **Finalidade:** `STUDY`.
- **Unidade:** titulares.
- **URL do dataset:** https://open.canada.ca/data/en/dataset/90115b00-f9b8-49e8-afa3-b4cff8facaee
- **Workbook validado:** https://www.ircc.canada.ca/opendata-donneesouvertes/data/EN_ODP_annual-TR-Study-IS_CITZ_year_end.xlsx
- **Worksheet:** primeira aba do workbook, resolvida pelo relacionamento XLSX.
- **Cabeçalho/recorte:** `Country of Citizenship`; linha `Brazil`.
- **Períodos validados:** 2000–2024, uma observação por ano, sem soma entre anos.
- **Arredondamento/supressão:** valores são arredondados pela fonte; `--` é preservado como `SUPPRESSED` e valor nulo.
- **Licença:** Open Government Licence — Canada 2.0.
- **Risco:** tabelas também oferecem permissões que entraram em vigor; não misturar fluxo anual com estoque em 31 de dezembro.
- **Resultado do gate:** 234 linhas lidas, 25 observações brasileiras, último valor 12.775 titulares em 2024; falha fechada para título, cabeçalho, Brasil, ano ou valor inválido.

## Alternatives Rejected

- **Apenas adicionar Estudo ao frontend:** rejeitado porque produziria um filtro sem contrato ou dados reais.
- **Usar uma métrica genérica `STUDY_VISAS`:** rejeitado porque esconderia eventos diferentes.
- **Somar Europa, Reino Unido e Canadá:** rejeitado por incompatibilidade de evento, universo e metodologia.
- **Criar novos endpoints por região:** rejeitado; as cinco rotas atuais já expressam finalidade, métrica e grupos.
