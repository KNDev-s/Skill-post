import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.dev.vars')) {
  console.log('.dev.vars já existe; nenhum valor foi alterado.');
  process.exit(0);
}
if (existsSync('backend/.env')) process.loadEnvFile('backend/.env');
const values = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',
  MEDIA_SIGNING_KEY: randomBytes(32).toString('hex'),
};
// Exclusive creation preserves a manually configured file. Values are never logged.
writeFileSync(
  '.dev.vars',
  Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
  { flag: 'wx', mode: 0o600 },
);
console.log(
  JSON.stringify({
    created: '.dev.vars',
    configured: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, Boolean(value)]),
    ),
  }),
);
