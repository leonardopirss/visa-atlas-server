# Snapshot do contrato compartilhado

`openapi.yaml` é uma cópia versionada do contrato mantido no repositório
`visa-atlas-client`, em
`specs/001-shared-api-contract/contracts/openapi.yaml`.

O snapshot existe para que os testes e o CI do backend sejam reproduzíveis sem
depender de um diretório irmão ou de acesso de rede a outro repositório privado.
Alterações de API devem ser aprovadas primeiro na fonte de verdade e depois
sincronizadas neste arquivo no mesmo conjunto de mudanças do backend.
