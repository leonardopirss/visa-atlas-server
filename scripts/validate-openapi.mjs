import SwaggerParser from '@apidevtools/swagger-parser';

const contractPath =
  process.env.OPENAPI_PATH ??
  '../visa-atlas-spec-kit/specs/001-shared-api-contract/contracts/openapi.yaml';

await SwaggerParser.validate(contractPath);
process.stdout.write(`OpenAPI contract valid: ${contractPath}\n`);
