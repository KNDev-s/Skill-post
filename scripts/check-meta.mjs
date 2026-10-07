import { existsSync } from 'node:fs';
// Read locally; no credentials in arguments, URLs, terminal output or reports.
const file = existsSync('.dev.vars') ? '.dev.vars' : 'backend/.env';
if (existsSync(file)) process.loadEnvFile(file);
const token = process.env.INSTAGRAM_ACCESS_TOKEN;
const account = process.env.INSTAGRAM_ACCOUNT_ID;
const host = process.env.INSTAGRAM_API_HOST || 'graph.instagram.com';
const version = process.env.META_API_VERSION || 'v21.0';
if (
  !token ||
  !account ||
  !['graph.instagram.com', 'graph.facebook.com'].includes(host) ||
  !/^v\d+\.0$/.test(version) ||
  !/^\d+$/.test(account)
) {
  console.error(
    'Configuração ausente ou inválida. Confira o arquivo local sem compartilhar seus valores.',
  );
  process.exit(1);
}
async function read(path) {
  const response = await fetch(`https://${host}/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    return { ok: false, status: response.status, code: Number(data?.error?.code) || null };
  return { ok: true, data };
}
try {
  const identity = await read(
    host === 'graph.instagram.com' ? 'me?fields=user_id,username' : `${account}?fields=id,username`,
  );
  const matches = identity.ok && String(identity.data.user_id || identity.data.id) === account;
  console.log(
    JSON.stringify({
      check: 'identity',
      ok: identity.ok,
      configuredAccountMatches: Boolean(matches),
      ...(identity.ok ? {} : { httpStatus: identity.status, code: identity.code }),
    }),
  );
  if (!matches) process.exit(1);
  let permissions = await read(
    host === 'graph.instagram.com' ? `${account}/permissions` : 'me/permissions',
  );
  if (!permissions.ok && host === 'graph.instagram.com') permissions = await read('me/permissions');
  const required =
    host === 'graph.instagram.com'
      ? ['instagram_business_basic', 'instagram_business_content_publish']
      : ['instagram_basic', 'instagram_content_publish'];
  const granted =
    permissions.ok && Array.isArray(permissions.data.data)
      ? permissions.data.data.filter((p) => p.status === 'granted').map((p) => p.permission)
      : [];
  console.log(
    JSON.stringify({
      check: 'permissions',
      readable: permissions.ok,
      required: Object.fromEntries(
        required.map((name) => [name, permissions.ok ? granted.includes(name) : null]),
      ),
    }),
  );
  console.log(
    'Validade/renovação do token e publicação real devem ser confirmadas separadamente. Nenhum post foi enviado.',
  );
  if (!permissions.ok || required.some((name) => !granted.includes(name))) process.exitCode = 2;
} catch {
  console.error(
    'Não foi possível consultar a Meta. Detalhes do provedor e credenciais foram omitidos.',
  );
  process.exitCode = 1;
}
