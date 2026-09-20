import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const candidates = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const secretNames = ['OPENAI_API_KEY', 'INSTAGRAM_ACCESS_TOKEN', 'MEDIA_SIGNING_KEY'];
if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
else if (existsSync('backend/.env')) process.loadEnvFile('backend/.env');
const values = secretNames.map((key) => process.env[key]).filter((v) => v && v.length >= 12);
const problems = [];
const history = execFileSync('git', ['log', '--all', '-p', '--format=', '--', '.'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (
  values.some((secret) => history.includes(secret)) ||
  /(?:IG[A-Z]{2}|EAA)[A-Za-z0-9]{60,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}/.test(history)
)
  problems.push({ file: 'git-history', reason: 'possible-secret' });
for (const file of tracked)
  if (/(^|\/)(\.env(\..*)?|\.dev\.vars(\..*)?)$/.test(file) && !file.endsWith('.example'))
    problems.push({ file, reason: 'tracked-env' });
function filesIn(dir) {
  return !existsSync(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)],
      );
}
for (const file of new Set([...candidates, ...filesIn('dist')])) {
  if (
    !existsSync(file) ||
    !/\.(ts|tsx|js|mjs|cjs|json|html|css|md|toml|yml|yaml|txt|example)$/.test(file)
  )
    continue;
  const content = readFileSync(file, 'utf8');
  if (
    values.some((secret) => content.includes(secret)) ||
    /(?:IG[A-Z]{2}|EAA)[A-Za-z0-9]{60,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}/.test(content)
  )
    problems.push({ file, reason: 'possible-secret' });
}
for (const file of ['.dev.vars', 'backend/.env']) {
  try {
    execFileSync('git', ['check-ignore', '-q', file]);
  } catch {
    problems.push({ file, reason: 'not-ignored' });
  }
}
console.log(
  JSON.stringify({ scannedFiles: new Set([...candidates, ...filesIn('dist')]).size, problems }),
);
if (problems.length) process.exitCode = 1;
