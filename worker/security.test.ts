import { describe, it, expect } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authenticate, mediaUrl, protectWrite, readJson, verifyMedia } from './security';
import type { Env } from './env';
import worker from './index';
const env = {
  APP_ORIGIN: 'https://social.example.com',
  ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
  ACCESS_AUD: 'test-audience',
  MEDIA_SIGNING_KEY: 'test-only-key-never-a-production-secret-123456',
} as Env;
describe('access and request security', () => {
  it('rejects missing and forged Access JWTs; verifies issuer, signature, audience and expiry', async () => {
    await expect(authenticate(new Request(env.APP_ORIGIN), env)).rejects.toMatchObject({
      status: 401,
    });
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const keys = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
    async function token(
      aud = env.ACCESS_AUD,
      expiry = '1h',
      issuer = `https://${env.ACCESS_TEAM_DOMAIN}`,
    ) {
      return new SignJWT({ email: 'test@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('owner-one')
        .setIssuer(issuer)
        .setAudience(aud)
        .setExpirationTime(expiry)
        .sign(privateKey);
    }
    const req = (jwt: string) =>
      new Request(env.APP_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
    expect(await authenticate(req(await token()), env, keys)).toBe('owner-one');
    for (const value of [
      'forged',
      await token('wrong'),
      await token(env.ACCESS_AUD, '-1h'),
      await token(env.ACCESS_AUD, '1h', 'https://evil.example'),
    ])
      await expect(authenticate(req(value), env, keys)).rejects.toMatchObject({ status: 401 });
  });
  it('fails closed with unconfigured Access, unexpected host and missing authentication', async () => {
    const missing = await worker.fetch(new Request(env.APP_ORIGIN), { ...env, ACCESS_AUD: '' });
    expect(missing.status).toBe(503);
    expect((await worker.fetch(new Request('https://other.example/'), env)).status).toBe(403);
    const noAuth = await worker.fetch(new Request(env.APP_ORIGIN), env);
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('Cache-Control')).toContain('no-store');
    expect(noAuth.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });
  it('rejects cross-origin writes, non-JSON and absent operation keys', async () => {
    const headers = {
      Origin: env.APP_ORIGIN,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    };
    expect(() => protectWrite(new Request(env.APP_ORIGIN, { headers }), env)).not.toThrow();
    for (const change of [
      { Origin: 'https://evil.example' },
      { 'Content-Type': 'text/plain' },
      { 'Idempotency-Key': '' },
    ])
      expect(() =>
        protectWrite(new Request(env.APP_ORIGIN, { headers: { ...headers, ...change } }), env),
      ).toThrow();
    await expect(
      readJson(new Request(env.APP_ORIGIN, { method: 'POST', body: 'x'.repeat(16385) })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(new Request(env.APP_ORIGIN, { method: 'POST', body: '{broken' })),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('binds public media URLs to one object and a maximum one-hour expiry', async () => {
    const now = Date.now();
    const key = 'post/1/slide.jpg';
    const url = new URL(await mediaUrl(env, key, now));
    expect(await verifyMedia(env, url, key, now)).toBe(true);
    expect(await verifyMedia(env, url, 'another/1/slide.jpg', now)).toBe(false);
    expect(await verifyMedia(env, url, key, now + 3600001)).toBe(false);
    url.searchParams.set('exp', String(Math.floor(now / 1000) + 10000));
    expect(await verifyMedia(env, url, key, now)).toBe(false);
  });
});
