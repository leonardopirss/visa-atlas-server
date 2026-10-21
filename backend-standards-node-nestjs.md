# Backend Standards — Node.js + NestJS

> **Versão 1.0 — Outubro de 2026**  
> Guia **genérico e reutilizável** para APIs, serviços e aplicações backend construídas com Node.js, TypeScript e NestJS.  
> **Fora de escopo:** regras de modularidade, organização obrigatória de pastas, padrões específicos de domínio, escolha obrigatória de banco/ORM e decisões próprias de um projeto.

## 0. Princípios e decisões de referência

- **Objetivo:** produzir código legível, testável, seguro, observável e evolutivo, sem abstrações desnecessárias.
- **Regra geral:** prefira simplicidade e composição. Design patterns resolvem problemas reais; não são requisitos para toda classe.
- **Compatibilidade:** para novos serviços em outubro de 2026, usar **Node.js 24 LTS** e **NestJS 12.x**, fixando versões compatíveis em lockfile. Atualizar esta referência conforme o ciclo de suporte.
- **Linguagem:** TypeScript em modo `strict`; JavaScript puro somente com justificativa.
- **Gerenciador de pacotes:** npm, pnpm ou yarn conforme o repositório; **um único lockfile** e instalação reprodutível em CI.
- **HTTP:** Express ou Fastify conforme requisitos, sem pressupor um adaptador em bibliotecas e testes.
- **Persistência:** tecnologia definida por necessidade (Prisma, TypeORM, Drizzle, SQL direto etc.), nunca por preferência imposta por este guia.
- **Testes:** Jest + `@nestjs/testing` + Supertest como referência inicial. Outra stack é válida se cobrir os mesmos níveis e manter execução confiável.
- **Qualidade:** ESLint com regras de TypeScript, Prettier, `tsc --noEmit`, testes e verificações de segurança no pipeline.

---

## 1. TypeScript e práticas da linguagem

### Obrigatório

- Habilitar `strict`, `noImplicitAny`, `strictNullChecks` e, quando compatível com o projeto, `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- Preferir `unknown` a `any`, com narrowing e validação explícitos nos limites de confiança.
- Usar `type` e `interface` para contratos; não presumir que tipos TypeScript validam dados em runtime.
- Utilizar `async/await` e tratar corretamente rejeições de Promises.
- Usar `readonly` onde houver intenção de imutabilidade e `const` por padrão.
- Preferir `map`, `filter`, `reduce` quando melhorarem clareza; loops são preferíveis quando simplificam o código.
- Preferir `?.`, `??`, `satisfies` e discriminated unions quando melhorarem a segurança dos tipos.
- Evitar coerções (`as`) sem justificativa; `as unknown as T` e `// @ts-ignore` exigem correção ou justificativa excepcional.
- Separar valores e tipos com `import type` quando apropriado, **sem remover imports necessários aos metadados e à DI do NestJS**.
- Não ignorar Promises (`no-floating-promises`), não usar `async` sem necessidade e não ocultar erros com `.catch(() => {})`.

### Evitar

- `any` indiscriminado, `!` (non-null assertion) sem prova de invariantes e objetos com propriedades dinâmicas sem validação.
- Estado global mutável, singletons manuais, funções enormes e classes com múltiplas responsabilidades.
- Bloquear o event loop com I/O síncrono, cálculos CPU-bound extensos ou parsing volumoso; avaliar workers/filas quando necessário.
- `Promise.all` irrestrito para milhares de tarefas; definir limites de concorrência e backpressure.
- Valores monetários em `number` de ponto flutuante quando precisão for relevante: usar representação decimal apropriada ou inteiros em menor unidade, com contrato explícito.

---

## 2. Clean Code e princípios de design

- **SOLID como heurística**, não como incentivo à criação de interfaces e camadas sem necessidade.
- **SRP:** classes e funções com responsabilidade clara.
- **OCP:** adicionar variantes sem alterar continuamente grandes condicionais quando um Strategy realmente simplificar.
- **LSP / ISP:** contratos coesos e implementações substituíveis.
- **DIP:** depender de contratos quando há necessidade real de troca de implementação ou isolamento de efeitos externos.
- **DRY:** remover duplicação de conhecimento; não extrair abstração só porque duas linhas coincidem.
- **KISS / YAGNI:** implementar o que o problema atual exige, evitando arquitetura especulativa.
- Nomes descritivos; funções pequenas com intenção clara; early return para reduzir aninhamento.
- Evitar magic numbers/strings, comentários que repetem o código e código morto.
- Prefira composição à herança; herança é aceitável quando representa uma relação estável e útil.
- Controllers recebem requisições, validam/encaminham e constroem respostas; **regras de negócio não ficam no controller**.
- Services/orquestradores devem ter comportamento efetivo; evitar classes que apenas delegam uma chamada sem valor adicional.
- Nunca adicionar boilerplate de arquitetura só para atender a uma convenção.

---

## 3. Recursos nativos do NestJS e injeção de dependências

- Usar constructor injection para dependências; evitar service locator (`ModuleRef.get`) no fluxo regular quando injeção explícita basta.
- Providers singleton são o padrão; `REQUEST` e `TRANSIENT` scopes só quando necessários e com consciência de custo/performance.
- **Interfaces TypeScript não existem em runtime**: para DI por interface usar token (`Symbol`/string) com `@Inject()` ou classe abstrata como token.
- `useClass`, `useValue`, `useExisting` e `useFactory` devem ser usados conforme o cenário, sem factories artificiais.
- Preferir `ConfigModule`/configuração injetável a ler `process.env` por toda a aplicação.
- Centralizar políticas transversais nos recursos apropriados do NestJS:

| Recurso               | Responsabilidade principal                                          | Não usar para                                   |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| **Pipes**             | Validação, parsing e transformação de entrada                       | Regras de negócio complexas                     |
| **Guards**            | Autenticação e autorização                                          | Conversão de DTOs                               |
| **Interceptors**      | Transformação de resposta, métricas, timing e aspectos transversais | Ocultar exceções de domínio                     |
| **Exception filters** | Padronização de erros HTTP                                          | Recuperar silenciosamente falhas                |
| **Middleware**        | Trabalho genérico no ciclo HTTP, com cautela sobre contexto         | Autorização que depende de metadata de handlers |
| **Providers**         | Serviços e dependências injetáveis                                  | Classes globais sem contrato definido           |

> **Observação:** o NestJS usa `@Module()` por funcionamento do framework. Este documento **não impõe** divisão por domínio, monólito modular, Clean Architecture, DDD ou uma árvore fixa de diretórios.

---

## 4. Design patterns: catálogo orientado a problemas

| Pattern                      | Aplicar quando                                                                 | Evitar quando                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Strategy**                 | Existem algoritmos/provedores intercambiáveis, selecionados por contexto       | Só existe uma variação e não há perspectiva concreta de mudança |
| **Factory / Factory Method** | Criar objetos envolve configuração, invariantes ou seleção de implementação    | Um `new` simples já comunica tudo                               |
| **Adapter**                  | Um SDK/API externo tem contrato diferente do contrato usado internamente       | Apenas repassa dados sem reduzir acoplamento                    |
| **Facade**                   | Simplifica uma API externa complexa para casos de uso reais                    | Apenas duplica um método sem ganhar clareza                     |
| **Repository**               | Abstrair queries/persistência melhora testes e domínio ou é requerido pelo ORM | Encapsula todas as chamadas triviais sem entregar valor         |
| **Observer / Pub-Sub**       | Múltiplas reações independentes a um evento                                    | Fluxo sequencial exige consistência e resposta imediata         |
| **Decorator / Interceptor**  | Adicionar comportamento transversal sem duplicar lógica                        | Torna o fluxo implícito ou difícil de depurar                   |
| **Builder**                  | Construção complexa com configurações opcionais e invariantes                  | DTO simples ou objeto literal atende                            |
| **Command / CQRS**           | Operações têm complexidade, auditoria ou escala de leitura/escrita distintas   | CRUD simples sem benefícios demonstráveis                       |
| **Outbox**                   | Publicação confiável de eventos depois de mudança transacional                 | Não existe integração assíncrona confiável a garantir           |
| **Circuit Breaker / Retry**  | Dependência externa instável, com política explícita de falha                  | Só adiciona latência ou repete operação não idempotente         |

### 4.1 Exemplo — Strategy + Dependency Injection

```ts
import { Inject, Injectable, Module } from '@nestjs/common';

export interface NotificationSender {
  send(destination: string, message: string): Promise<void>;
}

export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

@Injectable()
export class EmailNotificationSender implements NotificationSender {
  async send(destination: string, message: string): Promise<void> {
    // Integração real com o provedor de e-mail.
    // Omitida intencionalmente neste exemplo de contrato.
    void destination;
    void message;
  }
}

@Injectable()
export class NotifyUserService {
  constructor(
    @Inject(NOTIFICATION_SENDER)
    private readonly sender: NotificationSender,
  ) {}

  execute(destination: string, message: string): Promise<void> {
    return this.sender.send(destination, message);
  }
}

@Module({
  providers: [
    NotifyUserService,
    { provide: NOTIFICATION_SENDER, useClass: EmailNotificationSender },
  ],
})
export class ExampleModule {}
```

Este é um exemplo de troca de implementação em tempo de configuração. **Se a seleção precisa ser feita por requisição**, usar registro explícito/Strategy resolver com conjunto conhecido de implementações, sem injetar dependências dinamicamente de forma opaca.

### 4.2 Regras para aplicar patterns

1. Documentar o problema que o pattern resolve e quais alternativas foram consideradas quando a decisão for relevante.
2. Não criar `IService`, `ServiceImpl`, `Factory`, `Facade` e `Mapper` automaticamente para cada recurso.
3. Garantir testes para cada implementação que compartilha um contrato.
4. Testar composição/seleção de estratégias e casos de fallback.
5. Preferir contratos pequenos, estáveis e focados em comportamento.

---

## 5. APIs REST e contratos

- Recursos com substantivos no plural (`/users`, `/orders`); ações não-CRUD podem ser sub-recursos (`POST /orders/:id/retries`).
- `GET` não produz efeitos de negócio; `POST` cria/executa; `PUT` substitui; `PATCH` altera parcialmente; `DELETE` tem efeito idempotente quando aplicável.
- Definir semântica de `PATCH` (merge patch, JSON Patch ou patch de domínio) e documentá-la.
- Versionar interfaces públicas quando necessário (`/api/v1` ou outra estratégia consistente); preservar compatibilidade dentro da major.
- Usar JSON UTF-8 com propriedades `camelCase`, horários ISO-8601 e UTC; normalizar fuso em entrada e saída.
- Respostas consistentes: não exigir envelope universal, mas, **se o projeto adotar um**, mantê-lo em todos os endpoints compatíveis.
- `201 Created` com `Location` ao criar recurso endereçável; `204 No Content` sem body quando não houver representação.
- Paginação com limites máximos e ordenação apenas em campos permitidos. Preferir cursor/keyset para coleções volumosas.
- Filtros nomeados em query params; relatórios/exportações separadas das listagens operacionais.
- Validação em runtime para `body`, `params`, `query`, headers e payloads externos.
- DTOs de entrada e saída não devem expor entidades de persistência nem segredos.
- Documentar endpoints, autenticação, parâmetros, payloads e respostas com `@nestjs/swagger`/OpenAPI; validar o contrato na CI.
- Autenticação/autorizações não dependem do frontend. Aplicar checagens por recurso e permissões, não apenas por papel genérico.

### Exemplo — ValidationPipe

```ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }),
);
```

Esse exemplo pressupõe DTOs com `class-validator` e, quando necessário, `class-transformer`. É válido escolher **outra estratégia consistente** de validação (por exemplo, schemas com Zod e pipe apropriado); evite dois sistemas concorrentes no mesmo contrato sem motivo.

---

## 6. Tratamento de erros

- Criar um **ExceptionFilter global** para padronizar erros inesperados e mapear falhas conhecidas.
- Usar exceções semânticas (`BadRequestException`, `NotFoundException`, `ConflictException`, `ForbiddenException` etc.) na fronteira HTTP; erros de domínio não precisam conhecer HTTP.
- Não devolver stack trace, SQL, tokens, credenciais, headers sensíveis ou dados pessoais em respostas.
- Distinguir falha de validação (400), ausência de autenticação (401), falta de permissão (403), recurso ausente (404), conflito (409), precondição (412), negócio semanticamente inválido quando adotado (422), limitação de taxa (429) e falha interna (500).
- Registrar causas internas de maneira estruturada e sanitizada; o cliente recebe código estável, mensagem segura e referência de rastreio.

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Resource not found",
  "traceId": "f63a8d72e88b4e8a",
  "timestamp": "2026-10-19T12:30:00.000Z"
}
```

- Nunca usar `try/catch` genérico apenas para devolver `500`. Capturar erros quando houver recuperação, tradução de fronteira, logging contextual ou liberação de recurso.
- Evitar lançar `Error('something wrong')` sem código/contexto no caminho de negócio.

---

## 7. Persistência, concorrência e integrações

- Banco, ORM e migrações são decisões do projeto. **Migrações versionadas e reproduzíveis** são obrigatórias quando houver schema persistido.
- Não depender de `synchronize: true`, auto-criação de schema ou alteração destrutiva automática em produção.
- Usar parâmetros/bindings em SQL; nunca interpolar input em comandos SQL ou shell.
- Transações explícitas quando múltiplas operações precisam ser atômicas; limites e isolamento documentados nos fluxos relevantes.
- Índices, consultas, paginação e planos de execução devem ser avaliados por evidência de carga; prevenir N+1.
- Fazer escolhas explícitas para exclusão, auditoria, versionamento/optimistic locking e retenção de dados.
- Em operações com efeito externo ou financeiro, usar idempotência durável por chave e/ou identificador de negócio; definir tratamento de chave repetida com payload diferente.
- HTTP externo: timeout de conexão/resposta, cancelamento, limite de concorrência e tratamento de `4xx`/`5xx`.
- Retry apenas para falhas transitórias e operações seguras/idempotentes; usar backoff exponencial com jitter, limite de tentativas e observabilidade.
- Circuit breaker, filas, DLQ, outbox e sagas apenas se requisitos de resiliência/consistência realmente justificarem.
- Nunca tratar transação de banco e chamada HTTP externa como uma transação atômica sem mecanismo real de coordenação.

---

## 8. Segurança

- HTTPS em produção, TLS adequado e headers de segurança (`helmet` no adaptador compatível).
- Validar origem de CORS por allow-list. CORS **não substitui** autenticação nem protege clientes que não são navegadores.
- JWT/OAuth2/sessão conforme produto; validar assinatura, audiência, emissor, expiração e escopos; cookies requerem flags adequadas e proteção CSRF quando aplicável.
- Segredos só via ambiente/secret manager, nunca commitados. Validar configurações obrigatórias na inicialização.
- Rate limit/antiabuso, com cuidado para proxies e múltiplas réplicas; considerar armazenamento compartilhado quando necessário.
- Limites de body, uploads, duração de requisição, concorrência e tamanho de respostas, especialmente em endpoints públicos.
- Evitar mass assignment com whitelist; sanitizar saídas quando houver HTML e usar queries parametrizadas.
- Dependências auditadas, versões fixadas no lockfile, atualização de vulnerabilidades e menor privilégio em serviços e banco.
- Não colocar autenticação opcional ou bypass de autorização sem teste explícito que comprove os cenários permitidos.
- Não registrar tokens, senhas, documentos pessoais, dados de pagamento ou payloads sensíveis.

---

## 9. Logging, métricas e tracing

- Logs estruturados em JSON em produção; logger Nest configurado ou integração com Pino/Winston, conforme necessidade.
- Níveis consistentes: `debug` diagnósticos, `log/info` eventos relevantes, `warn` situações recuperáveis, `error` falhas com impacto.
- Propagar `traceId` / `correlationId` por requisições HTTP, jobs e mensagens; usar W3C Trace Context/OpenTelemetry quando houver tracing distribuído.
- Medir taxa de requisições, latência (p50/p95/p99), erros, throughput e saturação de recursos relevantes.
- Incluir dimensões úteis sem labels de cardinalidade excessiva (IDs únicos devem ficar em logs/traces, não como label métrica).
- Health/readiness/liveness com significado correto; readiness deve refletir capacidade de atender tráfego.
- Logs, traces e métricas devem permitir acompanhar fluxos de negócio sem vazar informação sensível.

---

## 10. Estratégia de testes

### 10.1 Pirâmide de testes

| Nível                  | Escopo                                                  | Abordagem recomendada                                                                  | Expectativa                                               |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Unitário**           | Regras puras, cálculos, validadores e estratégias       | Jest, sem inicializar Nest quando não necessário                                       | Rápido, determinístico, ampla cobertura de comportamentos |
| **Componente/serviço** | Colaboração de providers e orquestração                 | `@nestjs/testing`; fakes e mocks de fronteiras                                         | Validar interações relevantes, erros e resultados         |
| **Integração**         | ORM, SQL, migrações, repositórios, clientes e filas     | Banco/serviço real descartável via Testcontainers ou Docker; stubs HTTP para terceiros | Detectar problemas que mocks não revelam                  |
| **HTTP/E2E**           | Rota → pipes/guards → service → persistência → resposta | `@nestjs/testing` + Supertest (ou ferramenta compatível)                               | Validar contratos, segurança, status e serialização       |
| **Contrato**           | APIs consumidas/publicadas e mensagens                  | OpenAPI schema checks, consumer/provider contracts quando úteis                        | Impedir mudanças incompatíveis                            |
| **Performance**        | Caminhos críticos, carga e regressões                   | k6/Artillery ou equivalente                                                            | Avaliar latência, capacidade e falhas sob carga           |

### 10.2 Regras para escrever testes

1. Nomear pelo **comportamento esperado**, não pelo método privado: `shouldRejectExpiredToken`, `shouldNotChargeTwiceForSameIdempotencyKey`.
2. Aplicar Arrange–Act–Assert / Given–When–Then com asserções observáveis.
3. Testar sucesso, erro, limites, validação, ausência de registro, concorrência e idempotência conforme o caso.
4. **Preferir testes unitários sem `TestingModule`** para lógica pura; usar contêiner Nest quando DI/decorators/ciclo de vida estiverem no escopo.
5. Mockar **fronteiras externas** (provedor HTTP, clock, aleatoriedade, e-mail, SDKs). Um repository pode ser fake/mock em um teste de service isolado; a persistência real deve ser coberta por integração.
6. Não usar mock de service/repository como único teste de comportamento de persistência ou de fluxo crítico.
7. Evitar mockar a classe sob teste e verificar chamadas privadas. `toHaveBeenCalled...` é útil para efeitos externos; não substitui asserção do resultado.
8. Dados de teste independentes; controlar tempo com fake timers/clock injetado, limpar mocks/DB e impedir dependência da ordem da suíte.
9. Proibir `.only`/`.skip` em commits; exceções temporárias precisam de issue, justificativa e prazo de remoção.
10. Falhas intermitentes devem ser tratadas como bugs de teste/código, não corrigidas aumentando timeout arbitrariamente.

### 10.3 Exemplo — teste unitário puro

```ts
export function calculateNetTotal(amountInCents: number, discountInCents: number): number {
  if (!Number.isSafeInteger(amountInCents) || !Number.isSafeInteger(discountInCents)) {
    throw new TypeError('Amounts must be safe integers');
  }

  if (amountInCents < 0 || discountInCents < 0 || discountInCents > amountInCents) {
    throw new RangeError('Invalid amount or discount');
  }

  return amountInCents - discountInCents;
}

// calculate-net-total.spec.ts
import { calculateNetTotal } from './calculate-net-total';

describe('calculateNetTotal', () => {
  it('shouldSubtractDiscountFromTotal', () => {
    expect(calculateNetTotal(10_000, 2_500)).toBe(7_500);
  });

  it('shouldRejectDiscountGreaterThanAmount', () => {
    expect(() => calculateNetTotal(1_000, 1_001)).toThrow(RangeError);
  });
});
```

### 10.4 Exemplo — E2E HTTP (base)

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Aplicar aqui a mesma configuração global usada em produção
    // (pipes, filters, interceptors, versionamento etc.).
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('shouldReturnHealthStatus', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
```

> Este teste pressupõe que a aplicação disponibilize `GET /health` e use o adaptador HTTP compatível com Supertest. Para Fastify, seguir o fluxo de inicialização e testes adequado ao adaptador. Testes E2E reais também devem afirmar o **corpo/contrato esperado**, não apenas status.

### 10.5 Qualidade de cobertura

- Cobertura é **métrica de risco**, não objetivo isolado. Preferir cobertura de caminhos modificados e regras críticas à meta universal de 100%.
- CI bloqueia regressão de cobertura acordada pela equipe; exigir testes para alterações de negócio e fluxos vulneráveis.
- Usar mutation testing (por exemplo, StrykerJS) em componentes críticos ou de lógica complexa quando viável.
- Testes de integração devem executar migrações reais em ambiente isolado.
- Rodar parte da suíte em ordem aleatória ou ambientes limpos periodicamente para revelar dependência oculta.

---

## 11. Configuração e ciclo de vida

- Variáveis de ambiente validadas na inicialização (Zod/Joi ou `validate()` com schema apropriado); falhar cedo quando faltarem secrets/configurações essenciais.
- Separar configurações por ambiente sem incluir segredos no repositório; `.env.example` sem credenciais.
- Definir explicitamente políticas de timeout, tamanho de payload, conexões, retry e shutdown.
- Habilitar graceful shutdown; encerrar conexões, consumidores, workers e telemetria de forma controlada.
- Usar filas/cron conforme necessidade, com tratamento de duplicidade e coordenação entre réplicas.
- Feature flags precisam de comportamento padrão seguro, trilha de remoção e testes dos caminhos relevantes.

---

## 12. CI/CD e gates de qualidade

### Pipeline mínimo recomendado

```text
checkout + lockfile install
  → lint + format check
  → TypeScript typecheck
  → testes unitários
  → testes de integração / E2E
  → validação OpenAPI (quando aplicável)
  → auditoria de dependências + análise de segurança
  → build reproduzível
  → deploy condicionado ao processo do projeto
```

**Critérios para pull request:**

- Código formatado, lint e `tsc --noEmit` aprovados.
- Testes novos ou ajustados demonstrando mudanças de comportamento; nenhuma suíte vermelha.
- Contratos públicos, migrações e breaking changes avaliados/documentados.
- Mudanças de segurança, autenticação, idempotência e concorrência incluem testes negativos.
- Nenhum segredo, arquivo `.env` real ou dado sensível versionado.
- Sem `eslint-disable`, `ts-ignore`, `any`, skip de testes ou exceções de segurança sem justificativa explícita.
- Dependências atualizadas de forma controlada; evitar ranges instáveis em deploys sem lockfile.

### Scripts de referência (`package.json`)

```json
{
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:unit": "jest --testPathIgnorePatterns='.*\\.e2e-spec\\.ts$'",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "build": "nest build"
  }
}
```

> Scripts ilustrativos: adaptar glob/CLI e configuração do runner à versão selecionada. Em especial, manter **configurações distintas e explícitas** para unitários e E2E, em vez de confiar apenas em um filtro por nome.

---

## 13. Convenções de nomes e commits

| Elemento                                | Convenção                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| Variáveis, funções, propriedades JSON   | `camelCase`                                                           |
| Classes, DTOs, interfaces, tipos, enums | `PascalCase`                                                          |
| Constantes e variáveis de ambiente      | `UPPER_SNAKE_CASE`                                                    |
| Arquivos                                | `kebab-case.ts`, alinhado ao padrão do repositório                    |
| Arquivos de teste                       | `*.spec.ts` e `*.e2e-spec.ts`                                         |
| Colunas SQL                             | `snake_case` quando aplicável                                         |
| Commits                                 | Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:` |

Não reformatar um repositório inteiro por causa de uma mudança localizada; preferir consistência interna.

---

## 14. Checklist do agente/revisor

Antes de considerar uma implementação concluída, verificar:

- [ ] Os requisitos estão atendidos sem impor uma arquitetura ou estrutura de módulos não solicitada?
- [ ] Há código simples e legível, sem abstrações artificiais e duplicações de regra?
- [ ] Contratos TypeScript são estritos e payloads externos são validados em runtime?
- [ ] Controllers, guards, pipes, filters e interceptors são usados para responsabilidades adequadas?
- [ ] Design patterns estão justificados por um problema concreto?
- [ ] Há testes unitários para regras, testes de integração para infraestrutura e testes E2E para fluxos HTTP relevantes?
- [ ] Casos negativos, limites, erros e idempotência foram testados quando aplicáveis?
- [ ] Integrações possuem timeout e retry seguro quando necessário?
- [ ] Autenticação, autorização, logs e tratamento de erros não expõem dados sensíveis?
- [ ] Migrações e mudanças de contrato são reproduzíveis e documentadas?
- [ ] Lint, typecheck, testes e build executam com sucesso?
- [ ] Alterações desnecessárias ou decisões específicas de um projeto ficaram fora da implementação?

---

## Referências oficiais

- [Node.js — releases e suporte LTS](https://nodejs.org/en/about/previous-releases)
- [NestJS — releases](https://github.com/nestjs/nest/releases)
- [NestJS — testing](https://docs.nestjs.com/fundamentals/testing)
- [NestJS — custom providers e DI](https://docs.nestjs.com/fundamentals/custom-providers)
- [NestJS — validation](https://docs.nestjs.com/techniques/validation)
- [NestJS — OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS — configuration](https://docs.nestjs.com/techniques/configuration)
- [NestJS — rate limiting](https://docs.nestjs.com/security/rate-limiting)

**Nota de manutenção:** este é um padrão de engenharia, não um template de implementação. Sempre conferir compatibilidade de pacotes, comportamento do adaptador e alterações entre versões antes de copiar exemplos.
