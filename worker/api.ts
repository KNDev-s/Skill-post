import { z } from 'zod';
import { generatePostSchema, postSchema, type Post } from '../src/types/post';
import { AppError, conflict, type Env } from './env';
import { commit, getRow, rateLimit, replay, type Row } from './store';
import { protectWrite, readJson, sha256 } from './security';

const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
const captionSchema = revisionSchema.extend({ caption: z.string().trim().min(1).max(2200) });
const scheduleSchema = revisionSchema.extend({
  scheduledAt: z.string().datetime(),
  timeZone: z.string().min(1).max(80),
});
const json = (data: unknown, status = 200) => Response.json({ data }, { status });

export async function api(request: Request, env: Env, owner: string) {
  const path = new URL(request.url).pathname;
  const match = /^\/api\/v1\/posts(?:\/([a-zA-Z0-9-]{1,80}))?(?:\/(.*))?$/.exec(path);
  if (!match) throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
  const [, id, action] = match;
  if (request.method === 'GET') {
    if (!id && !action) {
      const recent = await env.DB.prepare(
        'SELECT document FROM posts WHERE owner=? ORDER BY rowid DESC LIMIT 30',
      )
        .bind(owner)
        .all<{ document: string }>();
      return json(recent.results.map((r) => postSchema.parse(JSON.parse(r.document))));
    }
    const row = await getRow(env, id, owner);
    const post = postSchema.parse(JSON.parse(row.document));
    if (!action) return json(post);
    const media = /^media\/([a-zA-Z0-9-]+)\/(\d+)\.(png|jpg)$/.exec(action);
    if (media && post.slides.some((s) => s.id === media[1])) {
      const object = await env.MEDIA.get(`${id}/${media[2]}/${media[1]}.${media[3]}`);
      if (!object) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada.');
      return new Response(object.body, {
        headers: { 'Content-Type': media[3] === 'png' ? 'image/png' : 'image/jpeg' },
      });
    }
    throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
  }
  if (!['POST', 'PATCH'].includes(request.method))
    throw new AppError(405, 'METHOD', 'Método não permitido.');
  protectWrite(request, env);
  await rateLimit(env, owner);
  const input = await readJson(request);
  const key = request.headers.get('Idempotency-Key')!;
  const hash = await sha256(`${request.method}\n${path}\n${JSON.stringify(input)}`);
  const previous = await replay(env, owner, key, hash);
  if (previous) return json(previous);
  const now = new Date().toISOString();
  if (!id && !action && request.method === 'POST') {
    const brief = generatePostSchema.strict().parse(input);
    if (!env.OPENAI_API_KEY)
      throw new AppError(503, 'AI_CONFIG', 'A geração ainda não foi configurada.');
    const post: Post = {
      id: crypto.randomUUID(),
      revision: 1,
      status: 'generating',
      brief,
      slides: [],
      caption: '',
      createdAt: now,
      updatedAt: now,
    };
    return json(await commit(env, owner, key, hash, 0, post, 'generate', null, Date.now()), 202);
  }
  if (!id || !action) throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
  const parsed = (
    action === 'caption' ? captionSchema : action === 'schedule' ? scheduleSchema : revisionSchema
  ).parse(input);
  const row = await getRow(env, id, owner);
  const post = postSchema.parse(JSON.parse(row.document));
  if (parsed.revision !== post.revision || row.publish_attempted || (row.job && !row.finished))
    throw conflict();
  if (!['ready', 'approved'].includes(post.status))
    throw new AppError(409, 'STATE', 'Este post não pode ser alterado neste estado.');
  let job: Row['job'] = null;
  let target: string | null = null;
  let due: number | null = null;
  if (action === 'caption' && request.method === 'PATCH') {
    post.caption = captionSchema.parse(input).caption;
    post.status = 'ready';
  } else if (action === 'approve' && request.method === 'POST') {
    if (!post.caption.trim() || post.slides.some((s) => !s.imageUrl))
      throw new AppError(409, 'INCOMPLETE', 'Gere todas as imagens e a legenda antes de aprovar.');
    post.status = 'approved';
  } else if (
    (action === 'regenerate' || /^slides\/[a-zA-Z0-9-]+\/regenerate$/.test(action)) &&
    request.method === 'POST'
  ) {
    if (!env.OPENAI_API_KEY)
      throw new AppError(503, 'AI_CONFIG', 'A geração ainda não foi configurada.');
    if (action !== 'regenerate') {
      target = action.split('/')[1];
      if (!post.slides.some((s) => s.id === target))
        throw new AppError(404, 'NOT_FOUND', 'Slide não encontrado.');
    }
    post.status = 'generating';
    job = 'generate';
    due = Date.now();
  } else if (['publish', 'schedule'].includes(action) && request.method === 'POST') {
    if (
      env.ENABLE_PUBLISHING !== 'true' ||
      !env.INSTAGRAM_ACCESS_TOKEN ||
      !env.INSTAGRAM_ACCOUNT_ID ||
      !env.MEDIA_SIGNING_KEY
    )
      throw new AppError(
        503,
        'PUBLISH_DISABLED',
        'Publicação ainda não liberada. Conclua a validação da conta e da configuração.',
      );
    if (post.status !== 'approved')
      throw new AppError(409, 'APPROVAL', 'Aprove o conteúdo antes de publicar.');
    job = 'publish';
    due = Date.now();
    post.status = 'publishing';
    if (action === 'schedule') {
      const schedule = scheduleSchema.parse(input);
      due = Date.parse(schedule.scheduledAt);
      if (due < Date.now() + 60000 || due > Date.now() + 30 * 86400000)
        throw new AppError(400, 'SCHEDULE', 'Agende entre um minuto e 30 dias no futuro.');
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: schedule.timeZone }).format();
      } catch {
        throw new AppError(400, 'TIMEZONE', 'Fuso horário inválido.');
      }
      post.status = 'scheduled';
      post.scheduledAt = schedule.scheduledAt;
      post.timeZone = schedule.timeZone;
    }
  } else throw new AppError(405, 'METHOD', 'Operação ou método não permitido.');
  const expected = post.revision;
  post.revision++;
  post.updatedAt = now;
  delete post.failure;
  return json(
    await commit(env, owner, key, hash, expected, postSchema.parse(post), job, target, due),
    job ? 202 : 200,
  );
}
