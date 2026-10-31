import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const NGINX_IMAGE =
  'nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236';

/** @param {string} source @param {RegExp} pattern @param {string} message */
function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

/** @param {string} source @param {string} name */
function serviceBlock(source, name) {
  const match = source.match(
    new RegExp(`^  ${name}:.*\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:|^volumes:|^networks:)`, 'm'),
  );
  if (!match?.[0]) throw new Error(`Compose service ${name} is missing`);
  return match[0];
}

const [base, virtualHost, composeSource] = await Promise.all([
  readFile('deploy/nginx/nginx.conf', 'utf8'),
  readFile('deploy/nginx/conf.d/visa-atlas.conf', 'utf8'),
  readFile('docker-compose.yml', 'utf8'),
]);

requireMatch(base, /server_tokens\s+off;/, 'Nginx version exposure must be disabled');
requireMatch(base, /limit_req_zone\s+\$binary_remote_addr/, 'Per-IP rate zone is required');
requireMatch(base, /limit_req_zone\s+\$server_name/, 'Virtual-host rate zone is required');
requireMatch(base, /large_client_header_buffers\s+2\s+8k;/, 'Header/URI limits are required');
requireMatch(base, /escape=json/, 'Structured escaped access logs are required');

requireMatch(
  virtualHost,
  /server\s+api-1:3000\s+max_fails=2\s+fail_timeout=5s;/,
  'api-1 upstream policy is missing',
);
requireMatch(
  virtualHost,
  /server\s+api-2:3000\s+max_fails=2\s+fail_timeout=5s;/,
  'api-2 upstream policy is missing',
);
requireMatch(virtualHost, /keepalive\s+32;/, 'Upstream keep-alive is required');
requireMatch(virtualHost, /limit_req_status\s+429;/, 'Nginx rate limiting must return 429');
requireMatch(virtualHost, /\^\(GET\|HEAD\|OPTIONS\)\$/, 'Only approved methods may pass');
requireMatch(
  virtualHost,
  /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;/,
  'Forwarded IP must overwrite untrusted input',
);
requireMatch(
  virtualHost,
  /proxy_set_header\s+X-Correlation-ID\s+\$correlation_id;/,
  'Controlled correlation ID must be propagated',
);
requireMatch(
  virtualHost,
  /proxy_next_upstream_tries\s+2;/,
  'Passive upstream failover is required',
);
if (/proxy_cache|ip_hash|sticky/i.test(virtualHost)) {
  throw new Error('Proxy cache and sticky-session directives are not allowed');
}

const nginxService = serviceBlock(composeSource, 'nginx');
for (const replica of ['api-1', 'api-2']) {
  const block = serviceBlock(composeSource, replica);
  if (/^ {4}ports:/m.test(block)) throw new Error(`${replica} must not publish host ports`);
  if (!/^ {6}- backend$/m.test(block) && replica === 'api-1') {
    throw new Error(`${replica} must use the private backend network`);
  }
}
if (!/^ {6}- '3000:8080'$/m.test(nginxService)) {
  throw new Error('Only Nginx must expose the public application port');
}
requireMatch(nginxService, /^ {4}user: '101:101'$/m, 'Nginx must run as an unprivileged user');
requireMatch(
  composeSource,
  /^ {2}backend:\n {4}internal: true$/m,
  'The backend Compose network must be internal',
);

run('docker', ['compose', 'config', '--quiet']);
const workspace = process.cwd();
run('docker', [
  'run',
  '--rm',
  '--user',
  '101:101',
  '--add-host',
  'api-1:127.0.0.1',
  '--add-host',
  'api-2:127.0.0.1',
  '--volume',
  `${resolve(workspace, 'deploy/nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`,
  '--volume',
  `${resolve(workspace, 'deploy/nginx/conf.d')}:/etc/nginx/conf.d:ro`,
  '--tmpfs',
  '/tmp',
  NGINX_IMAGE,
  'nginx',
  '-t',
]);
process.stdout.write('Nginx syntax and topology invariants are valid.\n');
