# Fontes oficiais de dados

## Catálogo mundial de países

O catálogo de identidade dos países é independente das observações estatísticas.
Ele deriva do dataset [`mledoze/countries`](https://github.com/mledoze/countries),
versão `5.1.0`, filtrado para os 249 códigos com status
`officially-assigned`. ISO2, ISO3 e região vêm desse snapshot; os nomes são
materializados em pt-BR pelo Unicode CLDR 48 via `Intl.DisplayNames` e ficam
versionados no próprio arquivo para não variar entre ambientes.

O snapshot original possui SHA-256
`359431fb9475666dfad1ea5e72e53521cef40520f65eecd08e02ba569eb8491b`.
O catálogo derivado e seus metadados vivem em
`src/modules/countries/data/world-country-catalog.v1.json` e são sincronizados
de forma idempotente durante o bootstrap, sem criar observações.

O dataset é disponibilizado sob
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Aviso de atribuição: “Contém informações de mledoze/countries,
disponibilizadas sob a Open Database License (ODbL) v1.0.” O catálogo derivado
permanece sob a mesma licença. Natural Earth continua sendo apenas a fonte das
geometrias e não determina quais países existem na API.

## Estatísticas publicadas no MVP

O recorte `BRA / WORK` usa o dataset oficial Eurostat
[`migr_resfirst`](https://ec.europa.eu/eurostat/databrowser/view/migr_resfirst/default/table),
“First permits by reason, length of validity and citizenship”. A definição e as
limitações metodológicas são mantidas no
[metadata de residence permits](https://ec.europa.eu/eurostat/cache/metadata/en/migr_res_esms.htm).

A extração automatizada usa a
[API Statistics](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/api-statistics)
em JSON-stat 2 e fixa as dimensões abaixo:

| Dimensão Eurostat | Código             | Uso interno                                   |
| ----------------- | ------------------ | --------------------------------------------- |
| `freq`            | `A`                | frequência anual                              |
| `unit`            | `PER`              | pessoas, sem conversão                        |
| `reason`          | `EMP`              | finalidade normalizada `WORK`                 |
| `citizen`         | `BR`               | cidadania normalizada `BRA`                   |
| `duration`        | `TOTAL`            | todas as durações                             |
| `geo`             | países reportantes | destino convertido de ISO2/Eurostat para ISO3 |

A métrica publicada é `FIRST_RESIDENCE_PERMITS_GRANTED`. Ela não representa
vistos consulares emitidos, pedidos recebidos nem probabilidade individual de
aprovação. O código de categoria original `EMP`, release, período, unidade e
fonte permanecem associados a cada observação.

Para reutilização comercial, o recorte exclui o Reino Unido. A política de
reutilização do Eurostat restringe dados de países fora da União Europeia,
EFTA e candidatos oficiais; o destino `GBR` é coberto separadamente pelo
dataset oficial `Occ_D02` do UK Home Office. A aplicação informa que o recorte
foi filtrado e normalizado e exibe o disclaimer da adaptação.

## Fonte complementar não usada na métrica do MVP

O Eurostat também publica
[`migr_resocc`](https://ec.europa.eu/eurostat/databrowser/view/migr_resocc/default/table),
com detalhamento de primeiras autorizações para atividades remuneradas. Ele não
é combinado com `migr_resfirst` nesta versão, evitando misturar universos ou
somar categorias não comparáveis.

## Reino Unido — vistos de trabalho patrocinado

A primeira fonte nacional admitida é o UK Home Office, tabela oficial
[`Occ_D02`](https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables),
“Grants of entry clearance visas, by occupation, industry and nationality”, no
arquivo SOC 2020. A publicação está sob a
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

O adaptador importa apenas `Nationality = Brazil`, os tipos `Worker` e
`Temporary Worker`, e preserva cada `Visa type subgroup` no código e rótulo da
classificação. O destino é `GBR`, a métrica é `WORK_VISAS_ISSUED`, a unidade é
`VISAS` e o grupo de comparação é exclusivo do dataset `Occ_D02`. Dependentes,
estudo, visita e família não fazem parte desta tabela. Os registros representam
concessões associadas a Certificate of Sponsorship e não pessoas únicas, taxa
de aprovação, permissões dentro do Reino Unido ou todos os vistos de trabalho.

O cliente descobre o XLSX no índice oficial ou aceita um URL oficial fixado no
runner interno. Ele aplica timeout, limite de 12 MiB, allowlist de host,
validação de `content-type`, limite expandido do ZIP e validação explícita de
aba/cabeçalhos. Somente anos-calendário com Q1–Q4 presentes são publicados; anos
parciais ou provisórios permanecem fora da API. O payload é identificado por
checksum e promovido atomicamente, sem rota pública de ingestão.

## Canadá — titulares IMP com permissão válida

A fonte canadense é o recurso XLSX anual do
[Immigration, Refugees and Citizenship Canada](https://open.canada.ca/data/en/dataset/360024f2-17e9-4558-bfc1-3616485d65b9),
“International Mobility Program (IMP) work permit holders (for work purposes
only) on December 31st by country of citizenship”, sob a
[Open Government Licence — Canada 2.0](https://open.canada.ca/en/open-government-licence-canada).

O adaptador importa somente a linha `Brazil`, uma observação por ano, com
`metricType=VALID_PERMIT_HOLDERS`, `unit=HOLDERS` e categoria `IMP`. O valor é o
estoque de titulares do IMP com permissão de trabalho válida em 31 de dezembro;
não é emissão anual, visto, aplicação, taxa ou probabilidade. Os valores
publicados são arredondados ao múltiplo de cinco e `--` é preservado como
`SUPPRESSED` com valor nulo.

O TFWP não é ingerido nem somado ao IMP. Consequentemente, a observação não deve
ser rotulada como total de trabalhadores ou permissões do Canadá. Dataset,
release e grupo de comparação são próprios e incompatíveis com Eurostat e Home
Office.

## Licença e atualização

O registro da organização identifica a política de reutilização da Comissão
Europeia (Decision 2011/833/EU). A API do Eurostat disponibiliza apenas o estado
mais recente; por isso o backend preserva cada payload obtido por checksum e
publica releases próprias de forma atômica. O mesmo versionamento por checksum
e promoção atômica é aplicado ao Home Office e ao IRCC.

O frontend publica uma auditoria de fontes e licenças acessível pelo rodapé,
com data da última verificação, permissão comercial, atribuição, condições de
reutilização e aviso de ausência de endosso governamental. A mesma auditoria
documenta Natural Earth, `mledoze/countries` e Unicode CLDR.

## Modalidade Estudo

O recorte `BRA / STUDY` mantém um dataset separado por fonte, para que a promoção
atômica de uma release de estudo nunca substitua a publicação de trabalho.

- Europa usa o Eurostat [`migr_resedu`](https://ec.europa.eu/eurostat/databrowser/view/migr_resedu/default/table), categoria `EDUC`, métrica `FIRST_RESIDENCE_PERMITS_GRANTED` e unidade `PER`.
- Reino Unido usa `Edu_D01/Data_Edu_D01`, agrega somente anos com Q1–Q4 e publica `APPLICATIONS_RECEIVED` em `APPLICATIONS`. Pedidos recebidos não são rotulados como vistos concedidos.
- Canadá usa o recurso IRCC “Study permit holders on December 31st by country of citizenship”, com `VALID_PERMIT_HOLDERS`, unidade `HOLDERS`, arredondamento oficial e `--` preservado como supressão.

Esses três indicadores não são somados ou ranqueados juntos: representam eventos,
universos, unidades e metodologias diferentes.

## Feature 008 — fontes avaliadas para indicadores de decisão

> Status: pesquisa/admission gate. Nenhuma fonte desta seção está publicada pela
> API até que contrato, migration, adapter, testes e release sejam aprovados.

### MVP candidato — UK Home Office `Vis_D02`

As [Immigration system statistics data tables](https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables)
e o [guia metodológico](https://www.gov.uk/government/publications/user-guide-to-home-office-immigration-statistics--9/user-guide-to-immigration-statistics)
identificam `Vis_D02` como outcomes de entry clearance por nacionalidade, tipo
de visto e outcome. A fonte foi admitida condicionalmente para Brasil/Work e
Brasil/Study porque issued e refused podem vir do mesmo dataset, release,
população e período.

A implementação deve ingerir issued, refused, withdrawn e lapsed como outcomes
brutos distintos. As taxas do Visa Atlas serão derivadas somente como:

```text
issued / (issued + refused)
refused / (issued + refused)
```

`Vis_D01` (applications) não pode ser denominador, pois application e outcome
são contados em eventos/coortes diferentes. Withdrawn e lapsed permanecem
auditáveis, mas fora do denominador inicial. Antes da ingestão, o adapter deve
validar `Notes`, worksheet, cabeçalhos, Brazil, visa-type sets, anos completos,
totais versus trimestres, revisões, SHA-256 e ausência de duplicação. Reuso sob
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/open-government-licence/)
com atribuição ao Home Office.

### Fontes rejeitadas para taxa de decisão

- Recursos mensais de Operational Processing do IRCC permanecem rejeitados até
  que inspeção estrutural prove outcomes equivalentes por finalidade, extensão,
  população e período. Holders de permits não são decisões.
- Eurostat `migr_resfirst`, `migr_resedu` e outras coleções de residence permits
  medem autorizações concedidas/emitidas; não fornecem o universo harmonizado de
  recusas e não podem gerar taxa de aprovação/refusa.

## Feature 008 — processamento e inventário avaliados

O [IRCC application processing system](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/reports-statistics/statistics-open-data/immigration-stats/application-processing-system.html)
foi admitido com ressalvas para snapshots de `PENDING_APPLICATIONS` de study/work
permits em scope `PROGRAM`. A fonte exclui extensões, arredonda contagens e não
oferece histórico estruturado identificado; cada captura deve preservar data,
arredondamento, payload/fingerprint e link. Dados do Open Data usam a licença
específica do recurso; páginas Canada.ca exigem revisão dos termos aplicáveis.

O workbook trimestral de
[Migration transparency data](https://www.gov.uk/government/statistical-data-sets/migration-transparency-data)
foi admitido condicionalmente para WIP/outstanding por route. O adapter deve
validar worksheet, definição de WIP, overseas/in-country, releases arquivadas e
correções. Percentual dentro do service standard não é contagem pendente.

[IRCC service standards](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/service-declaration/service-standards.html)
e [UKVI service standards](https://www.gov.uk/government/organisations/uk-visas-and-immigration/about/about-our-services)
podem alimentar somente `PROCESSING_TIME_TARGET`, com dias úteis/corridos e
scope explícitos. Calculadoras atuais, P80, projeções e expectativas não serão
rotuladas como mediana/P90. Nenhuma fonte harmonizada adequada para
`PROCESSING_TIME_MEDIAN` ou `PROCESSING_TIME_P90` foi admitida.

## Feature 008 — requisitos de modalidades avaliados

Requisitos só podem ser publicados após existir um `VisaProgram` pai verificado.
Foram admitidos condicionalmente para modelagem: Canada Study, UK Student, UK
Skilled Worker, Germany Study e Germany EU Blue Card. Fontes oficiais e decisões
detalhadas ficam no `specs/008-visa-decision-insights/research.md`.

- Taxas e fundos preservam moeda, base, pessoa/família, região, duração, data
  efetiva e condição; não há câmbio implícito.
- Dependentes, trabalho do cônjuge, renovação e residência usam `DEPENDS` quando
  condicionados; não são reduzidos a sim/não.
- Canada Work não recebe fundo nacional genérico. A UE não recebe taxa/fundo
  único. Student/work permit não implica residência permanente automática.
- Prazo fixo de settlement do UK Skilled Worker fica bloqueado até reconciliar
  texto legal vigente e anúncio governamental com data efetiva.
- Armazenar apenas fatos curtos e provenance; não copiar texto legal integral.

GOV.UK segue OGL quando aplicável; Comissão Europeia e portais nacionais exigem
verificação do aviso legal; páginas Canada.ca passam por revisão específica de
reuso antes de publicação comercial. Toda fonte usa `fetchedAt`, `verifiedAt`,
`effectiveAt`, URL oficial, fingerprint e histórico em vez de sobrescrever a
regra anterior.
