import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError, type Env } from './env';

const keysets = new Map<string, JWTVerifyGetKey>();
export async function authenticate(request: Request, env: Env, testKeys?: JWTVerifyGetKey) {
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') || !env.ACCESS_AUD)
    throw new AppError(
      503,
      'ACCESS_NOT_CONFIGURED',
      'O acesso da equipe ainda não foi configurado.',
    );
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token)
    throw new AppError(401, 'UNAUTHENTICATED', 'Entre pelo endereço protegido da aplicação.');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!keysets.has(issuer))
    keysets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  try {
    const { payload } = await jwtVerify(token, testKeys ?? keysets.get(issuer)!, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub', 'email'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error();
    return payload.sub;
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada. Entre novamente.');
  }
}

export function protectWrite(request: Request, env: Env) {
  if (
    request.headers.get('Origin') !== env.APP_ORIGIN ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  )
    throw new AppError(403, 'ORIGIN', 'Origem da solicitação não permitida.');
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')
    throw new AppError(415, 'CONTENT_TYPE', 'Envie conteúdo JSON.');
  if (!/^[0-9a-f-]{36}$/i.test(request.headers.get('Idempotency-Key') ?? ''))
    throw new AppError(400, 'IDEMPOTENCY_KEY', 'Identificador da operação inválido.');
}

export async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'BODY', 'Corpo da solicitação ausente.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new AppError(413, 'BODY_SIZE', 'Solicitação muito grande.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch {
    throw new AppError(400, 'JSON', 'JSON inválido.');
  }
}

export async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signingKey(secret: string) {
  if (!secret || secret.length < 32)
    throw new AppError(503, 'MEDIA_KEY', 'Proteção de mídia não configurada.');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function mediaUrl(env: Env, key: string, now = Date.now()) {
  const exp = String(Math.floor(now / 1000) + 3600);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(env.MEDIA_SIGNING_KEY),
    new TextEncoder().encode(`${key}\n${exp}`),
  );
  const sig = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${env.APP_ORIGIN}/media/${key}?exp=${exp}&sig=${sig}`;
}
export async function verifyMedia(env: Env, url: URL, key: string, now = Date.now()) {
  const exp = url.searchParams.get('exp') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  const ttl = Number(exp) - Math.floor(now / 1000);
  if (!/^\d{10}$/.test(exp) || ttl <= 0 || ttl > 3600 || !/^[a-f0-9]{64}$/.test(sig)) return false;
  return crypto.subtle.verify(
    'HMAC',
    await signingKey(env.MEDIA_SIGNING_KEY),
    Uint8Array.from(sig.match(/../g)!, (x) => parseInt(x, 16)),
    new TextEncoder().encode(`${key}\n${exp}`),
  );
}

export function secureResponse(response: Response, api = false) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  result.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (api) result.headers.set('Cache-Control', 'private, no-store');
  return result;
}
