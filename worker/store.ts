import type { Post } from '../src/types/post';
import { AppError, conflict, type Env } from './env';
export interface Row {
  id: string;
  owner: string;
  document: string;
  job: 'generate' | 'publish' | null;
  target_slide: string | null;
  due: number | null;
  started: number | null;
  finished: number | null;
  publish_attempted: number;
  container_id: string | null;
  published_id: string | null;
}
export async function getRow(env: Env, id: string, owner: string) {
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<Row>();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado.');
  return row;
}
export async function rateLimit(env: Env, owner: string) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(`${owner}:${Math.floor(now / 60000)}`, now + 120000)
    .first<{ count: number }>();
  if (!row || row.count > 20)
    throw new AppError(429, 'RATE_LIMIT', 'Muitas operações. Aguarde um minuto.');
}
export async function replay(env: Env, owner: string, key: string, hash: string) {
  const old = await env.DB.prepare('SELECT hash,document FROM commands WHERE owner=? AND key=?')
    .bind(owner, key)
    .first<{ hash: string; document: string }>();
  if (!old) return null;
  if (old.hash !== hash)
    throw new AppError(409, 'KEY_REUSED', 'Identificador já usado para outra operação.');
  return JSON.parse(old.document) as Post;
}
export async function commit(
  env: Env,
  owner: string,
  key: string,
  hash: string,
  expected: number,
  post: Post,
  job: Row['job'] = null,
  target: string | null = null,
  due: number | null = null,
) {
  try {
    await env.DB.prepare(
      'INSERT INTO commands(owner,key,hash,post_id,expected,document,job,target_slide,due,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(owner, key, hash, post.id, expected, JSON.stringify(post), job, target, due, Date.now())
      .run();
    return post;
  } catch (e) {
    const previous = await replay(env, owner, key, hash);
    if (previous) return previous;
    if (String(e).includes('QUOTA'))
      throw new AppError(
        429,
        'QUOTA',
        'Limite atingido: até 30 gerações por 24 horas na aplicação e 5 trabalhos pendentes por pessoa.',
      );
    if (String(e).includes('CONFLICT')) throw conflict();
    throw e;
  }
}
