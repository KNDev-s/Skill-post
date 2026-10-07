import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { api } from './api';
import { runJobs } from './jobs';
import { commit, getRow } from './store';
import type { Env } from './env';
import type { Post } from '../src/types/post';
const origin = 'https://social.example.com';
let mf: Miniflare;
let env: Env;
const brief = {
  topic: 'Tecnologia para pequenos negócios',
  slideCount: 3 as const,
  tone: 'educativo' as const,
  objective: 'leads' as const,
};
function request(
  path = '/posts',
  body: unknown = brief,
  method = 'POST',
  key = crypto.randomUUID(),
) {
  return new Request(`${origin}/api/v1${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
async function postFrom(response: Response) {
  return ((await response.json()) as { data: Post }).data;
}
async function seed(status: Post['status'] = 'approved') {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const post: Post = {
    id,
    revision: 1,
    status,
    brief,
    caption: 'Uma legenda revisada.',
    createdAt: now,
    updatedAt: now,
    slides: Array.from({ length: 3 }, (_, i) => ({
      id: `slide-${i}`,
      layout: i === 0 ? 'cover' : i === 2 ? 'closing' : 'content',
      title: 'Tecnologia',
      body: 'Soluções reais.',
      imageUrl: `${origin}/api/v1/posts/${id}/media/slide-${i}/1.png`,
    })),
  };
  await commit(env, 'alice', crypto.randomUUID(), 'seed', 0, post);
  for (const slide of post.slides) await env.MEDIA.put(`${id}/1/${slide.id}.jpg`, 'test-image');
  return post;
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'test',
      modules: true,
      script: 'export default { fetch() { return new Response("test"); } }',
      compatibilityDate: '2026-09-19',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  const DB = await mf.getD1Database('DB');
  const MEDIA = await mf.getR2Bucket('MEDIA');
  env = {
    DB,
    MEDIA,
    APP_ORIGIN: origin,
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'test-model',
    INSTAGRAM_API_HOST: 'graph.instagram.com',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_ACCESS_TOKEN: 'test-token',
    META_API_VERSION: 'v21.0',
    ENABLE_PUBLISHING: 'true',
    MEDIA_SIGNING_KEY: 'test-only-signing-secret-never-production',
  } as unknown as Env;
  const sql = await readFile(new URL('../migrations/0001_posts.sql', import.meta.url), 'utf8');
  // D1 exec handles one statement per line; keep trigger bodies in a single line.
  const statements = sql
    .replace(/--[^\n]*/g, '')
    .split(/;\s*(?=CREATE|$)/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
});
beforeEach(async () => {
  await env.DB.batch(
    ['DELETE FROM commands', 'DELETE FROM posts', 'DELETE FROM rate_limits'].map((sql) =>
      env.DB.prepare(sql),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await mf?.dispose();
});
describe('real D1/R2 integration', () => {
  it('persists jobs and isolates posts by signed-in owner', async () => {
    const post = await postFrom(await api(request(), env, 'alice'));
    expect(post.status).toBe('generating');
    expect((await getRow(env, post.id, 'alice')).job).toBe('generate');
    await expect(
      api(request(`/posts/${post.id}`, undefined, 'GET'), env, 'bob'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('deduplicates concurrent creates and rejects a key reused with another body', async () => {
    const key = crypto.randomUUID();
    const responses = await Promise.all([
      api(request('/posts', brief, 'POST', key), env, 'alice'),
      api(request('/posts', brief, 'POST', key), env, 'alice'),
    ]);
    expect((await postFrom(responses[0])).id).toBe((await postFrom(responses[1])).id);
    expect(await env.DB.prepare('SELECT count(*) as n FROM posts').first('n')).toBe(1);
    await expect(
      api(
        request('/posts', { ...brief, topic: 'Outro tema para publicação' }, 'POST', key),
        env,
        'alice',
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('atomically rejects stale simultaneous edits without saving a false success', async () => {
    const post = await seed();
    const results = await Promise.allSettled(
      ['Primeira legenda', 'Segunda legenda'].map((caption) =>
        api(request(`/posts/${post.id}/caption`, { revision: 1, caption }, 'PATCH'), env, 'alice'),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await env.DB.prepare('SELECT count(*) as n FROM commands').first('n')).toBe(2);
    expect(JSON.parse((await getRow(env, post.id, 'alice')).document).status).toBe('ready');
  });
  it('requires approval, enabled publishing, valid scheduling and locks scheduled content', async () => {
    const post = await seed('ready');
    await expect(
      api(request(`/posts/${post.id}/publish`, { revision: 1 }), env, 'alice'),
    ).rejects.toMatchObject({ status: 409 });
    await api(request(`/posts/${post.id}/approve`, { revision: 1 }), env, 'alice');
    await expect(
      api(
        request(`/posts/${post.id}/publish`, { revision: 2 }),
        { ...env, ENABLE_PUBLISHING: 'false' },
        'alice',
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      api(
        request(`/posts/${post.id}/schedule`, {
          revision: 2,
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          timeZone: 'Invalid/Zone',
        }),
        env,
        'alice',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await api(
      request(`/posts/${post.id}/schedule`, {
        revision: 2,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        timeZone: 'America/Sao_Paulo',
      }),
      env,
      'alice',
    );
    await expect(
      api(
        request(
          `/posts/${post.id}/caption`,
          { revision: 3, caption: 'Alteração indevida' },
          'PATCH',
        ),
        env,
        'alice',
      ),
    ).rejects.toMatchObject({ status: 409 });
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await runJobs(env);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('limits pending work and rolls back rejected commands', async () => {
    for (let i = 0; i < 5; i++) await api(request(), env, 'alice');
    await expect(api(request(), env, 'alice')).rejects.toMatchObject({ status: 429 });
    expect(await env.DB.prepare('SELECT count(*) as n FROM commands').first('n')).toBe(5);
  });
  it('does not publish twice after an ambiguous provider response or duplicate cron', async () => {
    const post = await seed();
    await api(request(`/posts/${post.id}/publish`, { revision: 1 }), env, 'alice');
    let publishes = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('media_publish')) {
        publishes++;
        throw new Error('network response lost');
      }
      return Response.json(
        path.includes('status_code') ? { status_code: 'FINISHED' } : { id: '98765' },
      );
    });
    await Promise.all([runJobs(env), runJobs(env)]);
    await runJobs(env);
    const row = await getRow(env, post.id, 'alice');
    expect(publishes).toBe(1);
    expect(row.publish_attempted).toBe(1);
    expect(JSON.parse(row.document).status).toBe('failed');
    expect(JSON.parse(row.document).failure).toContain('incerto');
    await expect(
      api(
        request(`/posts/${post.id}/publish`, { revision: JSON.parse(row.document).revision }),
        env,
        'alice',
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('marks published only after Meta returns a publication ID', async () => {
    const post = await seed();
    await api(request(`/posts/${post.id}/publish`, { revision: 1 }), env, 'alice');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      Response.json(
        String(url).includes('status_code') ? { status_code: 'FINISHED' } : { id: '98765' },
      ),
    );
    await runJobs(env);
    const row = await getRow(env, post.id, 'alice');
    expect(JSON.parse(row.document).status).toBe('published');
    expect(row.published_id).toBe('98765');
  });
  it('fails generation without leaking provider errors or substituting mock content', async () => {
    const post = await postFrom(await api(request(), env, 'alice'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('sensitive provider detail', { status: 401 }),
    );
    await runJobs(env);
    const output = JSON.parse((await getRow(env, post.id, 'alice')).document);
    expect(output.status).toBe('failed');
    expect(output.slides).toEqual([]);
    expect(JSON.stringify(output)).not.toContain('sensitive');
  });
  it('generates and serves private PNGs while keeping JPEGs available for publishing', async () => {
    const post = await postFrom(await api(request(), env, 'alice'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                slides: Array.from({ length: 3 }, () => ({
                  title: 'Uma ideia útil',
                  body: 'Uma solução prática para seu negócio.',
                })),
                caption: 'Legenda gerada.',
              }),
            },
          },
        ],
      }),
    );
    const render = vi.fn(
      async (_kind, options) =>
        new Response(new Uint8Array(1600), {
          headers: { 'Content-Type': `image/${options.screenshotOptions.type}` },
        }),
    );
    const generatedEnv = {
      ...env,
      ASSETS: { fetch: async () => new Response('test-asset') },
      BROWSER: { quickAction: render },
    } as unknown as Env;
    await runJobs(generatedEnv);
    const output = JSON.parse((await getRow(env, post.id, 'alice')).document) as Post;
    expect(output.status).toBe('ready');
    expect(render).toHaveBeenCalledTimes(6);
    const image = new Request(output.slides[0].imageUrl!);
    expect((await api(image, env, 'alice')).headers.get('Content-Type')).toBe('image/png');
    await expect(api(image, env, 'bob')).rejects.toMatchObject({ status: 404 });
  });
  it('limits costly generation globally, even after earlier jobs have finished', async () => {
    for (let i = 0; i < 30; i++) {
      const post = await seed('generating');
      await env.DB.prepare("UPDATE commands SET job='generate' WHERE post_id=?")
        .bind(post.id)
        .run();
    }
    await expect(api(request(), env, 'alice')).rejects.toMatchObject({ status: 429 });
    expect(await env.DB.prepare('SELECT count(*) as n FROM posts').first('n')).toBe(30);
  });
  it('rejects bursts and recovers an interrupted job without repeating a provider call', async () => {
    const post = await postFrom(await api(request(), env, 'alice'));
    const key = crypto.randomUUID();
    await api(request('/posts', brief, 'POST', key), env, 'alice');
    for (let i = 0; i < 18; i++) await api(request('/posts', brief, 'POST', key), env, 'alice');
    await expect(api(request('/posts', brief, 'POST', key), env, 'alice')).rejects.toMatchObject({
      status: 429,
    });
    await env.DB.prepare('UPDATE posts SET started=?')
      .bind(Date.now() - 17 * 60000)
      .run();
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await runJobs(env);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.parse((await getRow(env, post.id, 'alice')).document).status).toBe('failed');
  });
});
