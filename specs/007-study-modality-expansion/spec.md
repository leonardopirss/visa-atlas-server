# Feature Specification: Modalidade Estudo com fontes oficiais

**Feature Branch**: `007-study-modality-expansion`

**Created**: 2026-11-16

**Status**: Approved for phased implementation

**Input**: Adicionar a modalidade Estudo de ponta a ponta, começando pela Europa e seguindo por Reino Unido e Canadá, usando GitHub Spec Kit e preservando a semântica de cada fonte oficial.

## User Scenarios & Testing

### User Story 1 - Explorar estudo na Europa (Priority: P1)

Uma pessoa brasileira seleciona a finalidade Estudo e visualiza países europeus com dados oficiais de primeiras autorizações de residência emitidas por motivo de educação. Ela pode abrir um país, consultar o valor do período publicado, a série histórica e a fonte Eurostat sem confundir esse indicador com visto consular, matrícula, candidatura ou probabilidade de aprovação.

**Why this priority**: A ingestão Eurostat e o modelo de primeiras autorizações já existem para Trabalho. A Europa oferece o menor caminho para validar contrato, banco, API e frontend com uma segunda finalidade real.

**Independent Test**: Publicar uma release sintética estruturalmente fiel ao Eurostat para `BRA/STUDY`, selecionar Estudo no frontend e comprovar mapa, detalhe e série histórica para um país europeu, enquanto um país sem observação permanece disponível com estado indisponível.

**Acceptance Scenarios**:

1. **Given** o filtro em Trabalho, **When** o usuário seleciona Estudo, **Then** mapa, período, detalhe e série passam a consultar `purpose=STUDY` e não reutilizam valores de Trabalho.
2. **Given** uma observação Eurostat com `reason=EDUC`, `unit=PER`, `citizen=BR` e destino suportado, **When** a release é validada e publicada, **Then** ela aparece como `FIRST_RESIDENCE_PERMITS_GRANTED`, finalidade `STUDY`, unidade pessoas e grupo de comparação próprio.
3. **Given** categoria diferente de educação, unidade inesperada ou cidadania incompatível, **When** a ingestão roda, **Then** a observação não é publicada como Estudo e a falha é auditável.
4. **Given** um país europeu sem valor publicado, **When** o usuário o seleciona, **Then** a API retorna `200` com `value=null` e a interface não inventa zero.

---

### User Story 2 - Explorar estudo no Reino Unido (Priority: P2)

Após a entrega europeia estar validada, uma pessoa brasileira consulta dados oficiais do Home Office para estudo no Reino Unido, com rótulo que identifica exatamente se o valor representa aplicações ou concessões e com categoria original auditável.

**Why this priority**: O Home Office publica dados por nacionalidade em estrutura semelhante ao adaptador de trabalho, mas a série educacional mede um evento diferente e precisa de admissão semântica independente.

**Independent Test**: Ingerir uma fixture estrutural da tabela oficial aprovada, publicar somente o recorte brasileiro de estudo e verificar Reino Unido no mapa, detalhe, fonte e histórico sem afetar Europa.

**Acceptance Scenarios**:

1. **Given** o dataset educacional aprovado do Home Office, **When** a categoria brasileira de estudo é importada, **Then** evento, métrica, unidade, período e categoria original correspondem à documentação oficial.
2. **Given** fonte que só publica aplicações, **When** o dado é exibido, **Then** ele usa `APPLICATIONS_RECEIVED` e nunca é rotulado como visto concedido.
3. **Given** mudança de planilha ou coluna obrigatória ausente, **When** a ingestão roda, **Then** a release falha fechada e o último snapshot publicado continua disponível.

---

### User Story 3 - Explorar estudo no Canadá (Priority: P3)

Após Europa e Reino Unido, uma pessoa brasileira consulta titulares de permissões de estudo no Canadá publicados pelo IRCC, distinguindo estoque válido no fim do ano de novas permissões que entraram em vigor.

**Why this priority**: O IRCC possui fonte oficial por cidadania, mas os conceitos de titular válido e nova permissão não são intercambiáveis. O adaptador deve reutilizar a infraestrutura existente com configuração e validação específicas.

**Independent Test**: Ingerir uma fixture estrutural da planilha IRCC selecionada, publicar `BRA/STUDY` para Canadá e verificar que a UI usa o rótulo e a métrica do evento exato sem combinar numericamente com Europa ou Reino Unido.

**Acceptance Scenarios**:

1. **Given** uma linha IRCC para brasileiros titulares de permissão de estudo no fim do ano, **When** a ingestão é publicada, **Then** o valor usa `VALID_PERMIT_HOLDERS`, finalidade `STUDY` e unidade titulares.
2. **Given** célula suprimida, arredondada ou não numérica, **When** o adaptador processa o arquivo, **Then** preserva o estado oficial ou rejeita o valor conforme a política documentada, sem convertê-lo em zero.
3. **Given** as três regiões publicadas, **When** o modo Todos os países está ativo, **Then** a cobertura pode combiná-las como presença/ausência, mas comparação e ranking numérico permanecem bloqueados entre grupos incompatíveis.

### Edge Cases

- O último ano comum pode ser diferente entre Trabalho e Estudo; a troca de finalidade limpa `year` e `comparisonGroupId` antes de buscar defaults.
- Uma fonte pode publicar Estudo para um ano no qual outra ainda não publicou; o modo global mostra cobertura sem afirmar comparabilidade temporal.
- País válido sem release de Estudo continua clicável e retorna indisponibilidade honesta.
- Uma URL ou estrutura externa alterada não pode substituir o último snapshot válido por release vazia.
- Valores `0`, `null`, suprimidos, estimados e revisados mantêm significados distintos.
- Navegação direta ou retorno do navegador não pode manter métrica incompatível com a finalidade selecionada.

## Requirements

### Functional Requirements

- **FR-001**: O contrato público MUST aceitar `purpose=STUDY` nas cinco rotas existentes sem criar endpoint adicional.
- **FR-002**: Banco, tipos públicos e validação MUST representar `STUDY` como finalidade distinta de `WORK`.
- **FR-003**: A troca de finalidade MUST invalidar `year`, `metricType` incompatível e `comparisonGroupId`, selecionando defaults publicados para a nova finalidade.
- **FR-004**: O frontend MUST apresentar Finalidade como seletor acessível com Trabalho e Estudo e refletir a escolha no mapa, busca, lista, detalhe, comparação e série histórica.
- **FR-005**: A primeira entrega MUST ingerir Eurostat `migr_resedu` para educação, `citizen=BR`, `unit=PER` e destinos aprovados.
- **FR-006**: Observações europeias de Estudo MUST usar `FIRST_RESIDENCE_PERMITS_GRANTED`, categoria original `EDUC`, finalidade `STUDY` e grupo de comparação separado de Trabalho.
- **FR-007**: A segunda entrega MUST admitir e ingerir a fonte Home Office somente após registrar evento medido, tabela, licença, período, granularidade e categoria brasileira.
- **FR-008**: Dados britânicos de aplicações MUST usar `APPLICATIONS_RECEIVED`; dados de concessões só podem usar métrica de concessão se o dataset selecionado publicar explicitamente esse evento.
- **FR-009**: A terceira entrega MUST ingerir o dataset IRCC aprovado por cidadania e distinguir titulares válidos de permissões que entraram em vigor.
- **FR-010**: Dados canadenses de titulares válidos no fim do ano MUST usar `VALID_PERMIT_HOLDERS`, unidade titulares e finalidade `STUDY`.
- **FR-011**: Cada adaptador MUST preservar organização, dataset, release, categoria original, período, unidade, cidadania, destino, finalidade, métrica e status do dado.
- **FR-012**: Releases MUST passar por fetch, parse, validação, staging, checksum/idempotência e publicação atômica; uma falha não remove o último snapshot válido.
- **FR-013**: O modo Todos os países MAY combinar fontes somente para cobertura categórica; valores de grupos incompatíveis MUST NOT ser somados, ranqueados ou comparados.
- **FR-014**: Valores ausentes ou suprimidos MUST permanecer `null`; zero só pode ser publicado quando confirmado pela fonte.
- **FR-015**: Fixtures versionadas MUST ser sintéticas ou redistribuíveis, claramente identificadas e nunca promovidas como dados de produção.
- **FR-016**: Toda mudança de enum ou DTO MUST atualizar o OpenAPI canônico, o snapshot do backend, os tipos gerados, os validadores e os testes de contrato.
- **FR-017**: A implementação MUST manter cidadania `BRA` como único recorte público nesta feature.
- **FR-018**: Rótulos MUST descrever o evento estatístico exato e informar que volume não representa probabilidade pessoal de aprovação.

### Key Entities

- **VisaPurpose**: finalidade normalizada; ganha `STUDY` sem alterar o significado de `WORK`.
- **MetricObservation**: observação de fonte oficial vinculada a finalidade, métrica, período, unidade, status e categoria original.
- **ComparisonGroup**: fronteira de comparabilidade por dataset, métrica, cidadania, finalidade, período, unidade e metodologia.
- **SourceDataset / DatasetRelease**: identidade da fonte, versão estrutural, checksum e ciclo de publicação.
- **FilterState**: cidadania, finalidade, métrica, ano e grupo de comparação selecionados na interface.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% das cinco rotas aceitam `STUDY` e continuam aceitando `WORK`, com testes de contrato cobrindo ambos.
- **SC-002**: A Europa pode ser demonstrada independentemente antes do início da integração britânica, com mapa, detalhe e histórico reais ao contrato.
- **SC-003**: Cada adaptador comprova idempotência, rejeição semântica e preservação do último snapshot publicado.
- **SC-004**: 100% das observações de Estudo publicadas possuem fonte, release, categoria original, cidadania, destino, finalidade, métrica, período, unidade e grupo de comparação.
- **SC-005**: Nenhum teste permite que valores de Europa, Reino Unido e Canadá sejam tratados como numericamente comparáveis fora de um grupo compatível.
- **SC-006**: Usuários conseguem alternar Trabalho/Estudo por teclado e identificar finalidade, evento, período, unidade e fonte no fluxo principal.
- **SC-007**: Lint, format, typecheck, unitários, integração, contrato, build e E2E real passam nos dois repositórios ao final de cada fase regional.

## Assumptions

- Europa usa o dataset específico Eurostat `migr_resedu`, evitando que a publicação atômica por dataset substitua a release de Trabalho em `migr_resfirst`.
- Reino Unido começará com o evento diretamente suportado pela tabela oficial escolhida; aplicações e concessões não serão inferidas uma da outra.
- Canadá começará com titulares de permissões de estudo válidas no fim do ano por cidadania, alinhado ao adaptador de titulares existente.
- Programas e requisitos jurídicos de visto de estudante não fazem parte da primeira entrega estatística, salvo links oficiais já verificados.
- O trabalho será entregue em PRs separados por repositório e, quando útil, por fase regional.

## Out of Scope

- Elegibilidade individual, aconselhamento jurídico, custos, prazo de processamento ou chance de aprovação.
- Cidadanias diferentes de `BRA`.
- Ranking ou soma entre primeiras autorizações, aplicações de visto e titulares de permissão.
- Scraping de páginas sem endpoint ou arquivo oficial estável e licença/reutilização avaliada.
- Novas rotas públicas ou autenticação.
