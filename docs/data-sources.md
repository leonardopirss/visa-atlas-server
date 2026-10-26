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

| Dimensão Eurostat | Código | Uso interno |
| --- | --- | --- |
| `freq` | `A` | frequência anual |
| `unit` | `PER` | pessoas, sem conversão |
| `reason` | `EMP` | finalidade normalizada `WORK` |
| `citizen` | `BR` | cidadania normalizada `BRA` |
| `duration` | `TOTAL` | todas as durações |
| `geo` | países reportantes | destino convertido de ISO2/Eurostat para ISO3 |

A métrica publicada é `FIRST_RESIDENCE_PERMITS_GRANTED`. Ela não representa
vistos consulares emitidos, pedidos recebidos nem probabilidade individual de
aprovação. O código de categoria original `EMP`, release, período, unidade e
fonte permanecem associados a cada observação.

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

## Licença e atualização

O registro da organização identifica a política de reutilização da Comissão
Europeia (Decision 2011/833/EU). A API do Eurostat disponibiliza apenas o estado
mais recente; por isso o backend preserva cada payload obtido por checksum e
publica releases próprias de forma atômica. O mesmo versionamento por checksum
e promoção atômica é aplicado ao Home Office.
