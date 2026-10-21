import SwaggerParser from '@apidevtools/swagger-parser';

const contractPath = process.env.OPENAPI_PATH ?? 'contracts/openapi.yaml';

await SwaggerParser.validate(contractPath);
process.stdout.write(`OpenAPI contract valid: ${contractPath}\n`);
