# Feature Specification: Indicadores de decisão e requisitos de vistos

**Feature:** `008-visa-decision-insights` · **Prioridade:** P1 · **Status:** Draft para revisão · **Data:** 2026-11-16

## Problem

O Visa Atlas mostra volumes oficiais e modalidades verificadas, mas ainda não
responde perguntas centrais da jornada: qual parcela das decisões foi favorável,
quanto tempo a autoridade leva, qual é a fila publicada e quais custos, fundos e
direitos acompanham cada modalidade. Sem essas dimensões, comparar destinos
continua exigindo consultar e interpretar várias fontes oficiais fora do produto.

## User Scenarios & Testing

### US1 — Entender resultados de decisões (P1) 🎯 MVP

**Independent Test:** selecionar uma combinação destino/cidadania/finalidade com
numerador e denominador oficiais compatíveis exibe decisões favoráveis,
desfavoráveis e respectivas taxas; remover qualquer requisito de compatibilidade
faz a taxa ficar indisponível, sem estimativa.

**Acceptance Scenarios:**

1. **Given** resultados concedidos e recusados do mesmo universo, período,
   unidade, metodologia e release, **When** consulto a taxa de aprovação, **Then**
   vejo percentual, numerador, denominador substantivo (`granted + refused`),
   período, fonte e fórmula sem chamá-lo de total oficial de outcomes.
2. **Given** contagens com universos, períodos ou metodologias diferentes,
   **When** consulto o indicador, **Then** a taxa não é calculada e o motivo de
   indisponibilidade é apresentado.
3. **Given** uma fonte publica recusas como decisões e outra publica pedidos
   recusados, **When** os dados são ingeridos, **Then** os eventos permanecem
   semanticamente distintos.
4. **Given** numerador zero e denominador positivo, **When** a taxa é derivada,
   **Then** zero é exibido como valor confirmado; denominador zero ou ausente não
   produz divisão nem zero artificial.
5. **Given** uma taxa válida, **When** abro detalhe, histórico ou comparação,
   **Then** a interface afirma que o agregado não representa chance individual.

### US2 — Avaliar metas e pressão operacional (P2)

**Independent Test:** uma fonte oficial com prazo-alvo e estoque pendente aparece
com unidade, vigência e definição próprias, sem converter meta de serviço em
tempo observado nem misturar períodos incompatíveis.

**Acceptance Scenarios:**

1. **Given** um prazo-alvo oficial, **When** consulto a modalidade, **Then**
   ele é identificado como meta, não como tempo observado.
2. **Given** inventário pendente oficial, **When** consulto histórico, **Then**
   vejo contagem e período sem inferência automática de prazo futuro.
3. **Given** dados apenas nacionais ou sem cidadania, **When** aplico o filtro
   BRA, **Then** o sistema não faz fallback; o scope nacional precisa ser
   selecionado explicitamente e aparece sem cidadania.
4. **Given** uma contagem arredondada/aproximada pela fonte, **When** exibida,
   **Then** o incremento de arredondamento e a aproximação permanecem visíveis.
5. **Given** dados desatualizados, revisados, estimados ou suprimidos, **When**
   renderizados, **Then** o status original permanece visível.

### US3 — Comparar requisitos práticos da modalidade (P3)

**Independent Test:** duas modalidades verificadas mostram taxa governamental,
comprovação financeira, dependentes, trabalho do cônjuge, renovação e caminho
para residência com data efetiva e link oficial; fato ausente permanece “não
informado”.

**Acceptance Scenarios:**

1. **Given** um requisito oficial vigente, **When** abro a modalidade, **Then**
   vejo valor tipado, moeda/unidade quando aplicável, data efetiva, verificação e
   fonte.
2. **Given** taxa ou fundos em moedas diferentes, **When** comparo destinos,
   **Then** valores originais não compartilham escala e não há conversão implícita.
3. **Given** regra condicional, **When** exibida, **Then** a condição e o estado
   `DEPENDS` aparecem sem reduzi-la a sim/não.
4. **Given** requisito expirado substituído por outro, **When** consulto o estado
   atual, **Then** somente o vigente é destacado e o histórico continua auditável.
5. **Given** fonte ausente ou não verificada, **When** abro a modalidade, **Then**
   o produto não inventa valor nem usa conteúdo secundário como regra oficial.

### Edge Cases

- Numerador maior que denominador bloqueia publicação da taxa e gera relatório
  de qualidade; não é corrigido silenciosamente.
- Arredondamento preserva a precisão declarada pela fonte e nunca ultrapassa
  duas casas na apresentação inicial.
- “Pedidos recusados” não é sinônimo de “decisões desfavoráveis” sem confirmação
  metodológica da fonte.
- Tempo em dias corridos e dias úteis forma grupos incompatíveis.
- Um SLA, meta ou estimativa de calculadora oficial não é histórico observado.
- Taxas por pessoa, família e dependente são fatos separados.
- Valores `0`, `null`, suprimido, não aplicável e não informado são distintos.
- Alteração legal futura não substitui o requisito vigente antes de `effectiveAt`.

## Functional Requirements

- **VDI-FR-001:** O sistema DEVE manter eventos brutos de pedidos, decisões,
  concessões e recusas semanticamente distintos por `MetricType`.
- **VDI-FR-002:** Taxas derivadas só PODEM ser publicadas quando numerador e
  denominador compartilham destino, cidadania/abrangência, finalidade, população,
  período, unidade, metodologia e release compatíveis.
- **VDI-FR-003:** Cada taxa derivada DEVE expor fórmula, numerador, denominador,
  precisão, fonte e identificadores auditáveis das observações de origem.
- **VDI-FR-004:** Denominador nulo ou zero, dimensões incompatíveis ou qualidade
  inválida DEVEM resultar em indisponibilidade, nunca em estimativa silenciosa.
- **VDI-FR-005:** Taxas DEVEM ser armazenadas em basis points inteiros na v1 e
  apresentadas como percentual; contagens continuam em `COUNT`.
- **VDI-FR-006:** Prazos-alvo DEVEM ser fatos versionados da modalidade, com
  duração/unidade original e vigência; não são observações históricas.
- **VDI-FR-007:** Inventário pendente DEVE ser mostrado como contagem histórica,
  sem gerar previsão automática de processamento.
- **VDI-FR-008:** População (`CITIZENSHIP` ou `NATIONAL`) e `programKey` DEVEM ser
  dimensões ortogonais e acompanhar cada métrica; scope nacional exige consulta
  explícita e não aceita cidadania falsa.
- **VDI-FR-009:** Requisitos de modalidade DEVEM usar valores discriminados para
  dinheiro, duração e estado, com condições em schema fechado/versionado; texto
  livre é apenas apresentação.
- **VDI-FR-010:** Taxas governamentais e fundos DEVEM preservar moeda, base de
  cobrança, quantidade de pessoas e valor original; conversão monetária está fora
  desta versão.
- **VDI-FR-011:** Direitos de dependentes/cônjuge, renovação e caminho para
  residência DEVEM aceitar `YES`, `NO`, `DEPENDS` e `UNKNOWN`, com condição e
  fonte quando aplicável.
- **VDI-FR-012:** Fatos legais DEVEM conter `effectiveAt`, `verifiedAt`, URL
  oficial segura e histórico, sem apagar versões anteriores.
- **VDI-FR-012A:** Caminhos pós-estudo ou para residência DEVEM ser transições
  versionadas entre rotas; uma transição possível não pode ser exibida como
  residência garantida.
- **VDI-FR-013:** O contrato público DEVE evoluir de forma aditiva, reutilizando
  os cinco endpoints REST v1; não será criado endpoint específico de comparação.
- **VDI-FR-014:** Detalhe, histórico e comparação DEVEM manter fonte, período,
  status, unidade e aviso de limite interpretativo visíveis.
- **VDI-FR-015:** O sistema NÃO DEVE produzir score, ranking, recomendação,
  elegibilidade nem probabilidade pessoal de aprovação.
- **VDI-FR-016:** Toda ingestão DEVE ser idempotente, falhar fechada diante de
  mudança estrutural e preservar o último release publicado válido.
- **VDI-FR-017:** Dados sintéticos DEVEM existir apenas em testes e ser
  explicitamente identificados; builds de produção só usam fontes aprovadas.
- **VDI-FR-018:** Entradas, URLs e textos externos DEVEM ser validados; jobs e
  relatórios não podem expor segredo ou dado pessoal.

## Key Entities

- **MetricObservation:** observação bruta oficial, preservando evento, unidade,
  período, abrangência, grupo comparável e status.
- **MetricDerivation:** proveniência de uma taxa, ligando resultado a numerador,
  denominador, fórmula, precisão e validação.
- **MeasurementMetadata:** precisão, aproximação e incremento de arredondamento
  de uma observação oficial.
- **VisaProgramRequirement:** fato versionado e tipado de uma modalidade, com
  vigência, verificação, condição e fonte oficial.
- **RequirementValue:** união validada de dinheiro, duração ou estado.
- **RequirementCondition:** união fechada/versionada para família, geografia,
  contexto/local da aplicação, pessoa, duração, retenção de fundos, nível de
  programa e classe ocupacional.
- **VisaProgramPathway:** transição condicional e versionada entre modalidade e
  rota posterior de trabalho ou residência.

## Success Criteria

- **VDI-SC-001:** 100% das taxas publicadas em teste de integração possuem
  numerador e denominador rastreáveis e compatíveis.
- **VDI-SC-002:** A suíte rejeita denominador zero, numerador maior, períodos,
  unidades, populações, metodologias ou releases incompatíveis.
- **VDI-SC-003:** Uma pessoa identifica em cada indicador evento, abrangência,
  período, unidade, status, fonte e limite interpretativo sem depender de cor.
- **VDI-SC-004:** Meta, inventário e taxa nunca compartilham
  rótulo ou formatação enganosa nos testes de contrato e interface.
- **VDI-SC-005:** Requisitos atuais e históricos preservam moeda/unidade, vigência
  e fonte; ausência nunca é exibida como `NO` ou zero.
- **VDI-SC-006:** Contrato, lint, tipos, testes, build e Playwright contra backend
  e banco reais de teste passam antes da conclusão.

## Assumptions

- A primeira entrega continua priorizando cidadania brasileira e finalidades
  Trabalho/Estudo, mas admite métricas oficiais apenas nacionais com abrangência
  explícita.
- A fonte oficial pode não oferecer todas as métricas para todos os destinos;
  cobertura parcial é aceita e exibida honestamente.
- Aprovação/refusa é um agregado histórico, não aconselhamento migratório.
- Valores monetários permanecem na moeda original nesta feature.

## Out of Scope

- Custo de vida, aluguel, salário, câmbio, PPP e conversão monetária.
- Score de facilidade, ranking de países, recomendação e previsão individual.
- Extração por IA de texto legal sem revisão humana e fonte oficial.
- Formulário de candidatura, upload de documentos, conta ou dados pessoais.
- Alertas de alteração legal, push notification ou analytics de terceiros.
