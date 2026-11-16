# Data Model: Modalidade Estudo

## Enum changes

```text
VisaPurposeCode
├── WORK   (existing)
└── STUDY  (new)
```

Nenhum `MetricType` novo é necessário para as três fases planejadas:

- Europa: `FIRST_RESIDENCE_PERMITS_GRANTED`
- Reino Unido: `APPLICATIONS_RECEIVED` ou métrica de concessão existente após gate
- Canadá: `VALID_PERMIT_HOLDERS`

## Invariants

1. `MetricObservation.purposeCode` deve corresponder à finalidade configurada pelo adaptador.
2. `ComparisonGroup` separa `WORK` e `STUDY` mesmo quando dataset, período e unidade coincidem.
3. A unicidade existente já inclui `purposeCode`; nenhuma observação de Estudo substitui Trabalho.
4. `VisaPurpose(STUDY, "Estudo")` deve existir antes do staging.
5. Releases e datasets de fontes distintas não compartilham comparison group.
6. `null` não é convertido em zero e status oficial é preservado.

## Migration

- Adicionar `STUDY` ao enum PostgreSQL `VisaPurposeCode` de forma aditiva.
- Inserir/upsert da dimensão `visa_purposes` durante sincronização de referência.
- Não reescrever observações existentes.
- Rollback lógico: frontend pode ocultar `STUDY`; remoção do enum não é rollback seguro e não será automatizada.

## Filter transitions

Ao mudar `purpose`:

1. definir nova finalidade;
2. selecionar métrica default compatível;
3. definir `year=null`;
4. definir `comparisonGroupId=null`;
5. buscar defaults/release publicados;
6. refazer mapa e detalhe, cancelando respostas antigas via query key/signal.
