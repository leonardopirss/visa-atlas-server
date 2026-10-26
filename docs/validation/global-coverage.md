# Validação — cobertura global

Data: 2026-10-26

## Gates executados

- `npm run format:check`: passou.
- `npm run lint`: passou, zero warnings.
- `npm run typecheck`: passou.
- `npm test`: 18 suítes e 55 testes passaram, incluindo unitários,
  integração, contrato e performance.
- `npm run build`: passou.
- `npm run contract:validate`: passou; o snapshot backend e a fonte compartilhada
  permanecem idênticos.
- Ingestão real controlada UK: 12 observações publicadas, total 819 para 2025.
- Cinco rotas v1: catálogo, mapa, detalhe e série conferidos para UK; nenhuma
  rota pública nova foi adicionada.
- Playwright frontend contra backend real: 2/2 passaram.
- A suíte usa o schema isolado `public_test`; uma trava recusa limpeza no schema
  de desenvolvimento. A contagem e o checksum do banco principal permaneceram
  idênticos antes e depois da execução completa.
- Reingestão Eurostat real: 594 observações publicadas. Para 2025, 32 dos 33
  destinos configurados têm valor disponível; `GBR` está explicitamente
  `UNAVAILABLE` na fonte. O fixture sintético anterior foi removido.
- Ingestão real IRCC: 25 observações anuais IMP (2000–2024) publicadas. O mapa,
  detalhe e série retornam 15.655 titulares brasileiros em 31/12/2024 para
  `CAN`, sem somar TFWP nem misturar grupos de comparação.

O teste de performance sincroniza os 249 países, cria dois datasets publicados,
confere os índices compostos e executa `EXPLAIN` nos acessos por país/período e
por grupo publicado. O plano comprova o uso do novo índice
`metric_observations_comparison_group_id_destination_iso3_idx`.

## Revisão operacional e de segurança

- Cache HTTP permanece `public, max-age=60, stale-while-revalidate=60`.
- Respostas de erro e de rate limit usam `Cache-Control: no-store`; o `429`
  inclui `Retry-After`. O limite permanece 120 requisições por IP a cada 60
  segundos, com limpeza de janelas expiradas.
- IDs de correlação recebidos são aceitos somente em um alfabeto seguro e logs
  de falhas HTTP inesperadas não serializam exceção, headers ou payload.
- O cliente UK limita HTML a 2 MiB, XLSX a 12 MiB e conteúdo expandido a
  100 MiB; valida timeout, tipo MIME, host oficial, aba e cabeçalhos.
- O cliente IRCC limita o XLSX a 2 MiB e o ZIP expandido a 5 MiB; valida
  timeout, MIME, relacionamento da planilha, título, cabeçalhos e linha Brasil.
- Logs de ingestão contêm apenas IDs, dataset, contagem e razão de falha; não
  registram payload, nomes individuais ou dados pessoais.
- Falhas de parsing/validação não promovem release e preservam o snapshot
  publicado, coberto por integração.
- Busca por padrões de segredos não encontrou credenciais versionadas.
- Licenças e atribuições estão registradas em `docs/data-sources.md`; a fixture
  UK e a fixture IRCC são explicitamente sintéticas.

## Auditoria e pendências conhecidas

`npm audit --audit-level=moderate` ficou com 4 alertas high no encadeamento
`@nestjs/platform-express -> multer` (`GHSA-q7qp-rjg7-q26m`). O projeto não
expõe upload multipart; a correção automática sugerida força downgrade
incompatível de Nest 12 para 11.1.1 e não foi aplicada. O risco permanece como
pendência de supply chain até existir versão compatível no encadeamento Nest.

A descrição de `YearOptional` recebeu apenas delimitação YAML por aspas, sem
alteração semântica. Isso eliminou a chave espúria preexistente e tornou o
OpenAPI 3.1 válido.
