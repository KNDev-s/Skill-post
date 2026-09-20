import { postSchema, type Post } from '../src/types/post';
import { generate } from './ai';
import type { Env } from './env';
import { meta, prepareCarousel } from './meta';
import { artAssets, renderSlide } from './render';
import type { Row } from './store';
const uncertainty =
  'Resultado da publicação incerto. Confira o Instagram e o registro no banco antes de qualquer nova publicação. Este post está bloqueado para evitar duplicidade.';
export async function runJobs(env: Env) {
  const now = Date.now();
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires < ?').bind(now).run();
  await env.DB.prepare(
    `UPDATE posts SET finished=?, document=json_set(document,'$.status','failed','$.failure',CASE WHEN job='publish' THEN ? ELSE 'O processamento foi interrompido. Gere um novo post.' END,'$.revision',json_extract(document,'$.revision')+1,'$.updatedAt',?) WHERE started < ? AND finished IS NULL`,
  )
    .bind(now, uncertainty, new Date(now).toISOString(), now - 16 * 60000)
    .run();
  // One atomic claim per cron. External operations are never automatically repeated.
  const row = await env.DB.prepare(
    `UPDATE posts SET started=?, document=json_set(document,'$.status',CASE WHEN job='publish' THEN 'publishing' ELSE 'generating' END,'$.revision',json_extract(document,'$.revision')+1,'$.updatedAt',?)
    WHERE id=(SELECT id FROM posts WHERE job IS NOT NULL AND started IS NULL AND finished IS NULL AND due<=? ORDER BY CASE WHEN job='publish' THEN 0 ELSE 1 END,due LIMIT 1)
    AND started IS NULL RETURNING *`,
  )
    .bind(now, new Date(now).toISOString(), now)
    .first<Row>();
  if (!row) return;
  const post = postSchema.parse(JSON.parse(row.document));
  try {
    if (row.job === 'generate') {
      const result = await generate(env, post, row.target_slide);
      const assets = await artAssets(env);
      const slides = [];
      for (let i = 0; i < result.slides.length; i++) {
        const slide = result.slides[i];
        slides.push(
          row.target_slide && slide.id !== row.target_slide
            ? slide
            : await renderSlide(
                env,
                slide,
                i,
                result.slides.length,
                post.id,
                post.revision,
                assets,
              ),
        );
      }
      post.slides = slides;
      post.caption = result.caption;
      post.status = 'ready';
    } else {
      const containerId = await prepareCarousel(env, post);
      // Persist the fence before media_publish; lost responses require manual reconciliation.
      const fence = await env.DB.prepare(
        'UPDATE posts SET publish_attempted=1,container_id=? WHERE id=? AND started=? AND finished IS NULL AND publish_attempted=0 RETURNING id',
      )
        .bind(containerId, post.id, row.started)
        .first();
      if (!fence) return;
      row.publish_attempted = 1;
      const result = await meta(env, `${env.INSTAGRAM_ACCOUNT_ID}/media_publish`, {
        creation_id: containerId,
      });
      if (!result.id || !/^\d+$/.test(result.id)) throw new Error('META_PUBLISH_UNKNOWN');
      await env.DB.prepare('UPDATE posts SET published_id=? WHERE id=? AND started=?')
        .bind(result.id, post.id, row.started)
        .run();
      post.status = 'published';
      post.publishedAt = new Date().toISOString();
    }
    await finish(env, row, post);
  } catch {
    post.status = 'failed';
    post.failure =
      row.job === 'publish'
        ? row.publish_attempted
          ? uncertainty
          : 'Publicação não concluída. Verifique a configuração e as permissões da Meta. O post permanece bloqueado para revisão.'
        : 'Não foi possível gerar o conteúdo e todas as imagens. Verifique o provedor, o saldo e o Browser Run; nenhum conteúdo simulado foi usado.';
    await finish(env, row, post);
    console.warn(
      JSON.stringify({
        event: 'job_failed',
        postId: post.id,
        kind: row.job,
        publishAttempted: Boolean(row.publish_attempted),
      }),
    );
  }
}
async function finish(env: Env, row: Row, post: Post) {
  post.revision++;
  post.updatedAt = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE posts SET document=?,finished=? WHERE id=? AND started=? AND finished IS NULL',
  )
    .bind(JSON.stringify(postSchema.parse(post)), Date.now(), post.id, row.started)
    .run();
}
