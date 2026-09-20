import type { Post } from '../src/types/post';
import { AppError, type Env } from './env';
import { mediaUrl } from './security';
export async function meta(env: Env, path: string, data?: Record<string, string | boolean>) {
  if (
    !['graph.instagram.com', 'graph.facebook.com'].includes(env.INSTAGRAM_API_HOST) ||
    !/^v\d+\.0$/.test(env.META_API_VERSION) ||
    !/^\d+$/.test(env.INSTAGRAM_ACCOUNT_ID)
  )
    throw new Error('META_CONFIG');
  const result = await fetch(`https://${env.INSTAGRAM_API_HOST}/${env.META_API_VERSION}/${path}`, {
    method: data ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!result.ok)
    throw new AppError(
      502,
      'META_PROVIDER',
      'A Meta recusou a operação. Verifique token, permissões e conta no painel da Meta.',
    );
  return (await result.json()) as {
    id?: string;
    user_id?: string;
    username?: string;
    status_code?: string;
  };
}
async function ready(env: Env, id: string) {
  for (let i = 0; i < 12; i++) {
    const value = await meta(env, `${id}?fields=status_code`);
    if (value.status_code === 'FINISHED') return;
    if (['ERROR', 'EXPIRED'].includes(value.status_code ?? '')) throw new Error('META_CONTAINER');
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error('META_NOT_READY');
}
export async function prepareCarousel(env: Env, post: Post) {
  if (env.ENABLE_PUBLISHING !== 'true') throw new Error('PUBLISH_DISABLED');
  const children: string[] = [];
  for (const slide of post.slides) {
    const path = new URL(slide.imageUrl!).pathname;
    const match = /^\/api\/v1\/posts\/([a-zA-Z0-9-]+)\/media\/([a-zA-Z0-9-]+)\/(\d+)\.png$/.exec(
      path,
    );
    if (!match || match[1] !== post.id || match[2] !== slide.id) throw new Error('MEDIA_PATH');
    const key = `${post.id}/${match[3]}/${slide.id}.jpg`;
    if (!(await env.MEDIA.head(key))) throw new Error('MEDIA_MISSING');
    const item = await meta(env, `${env.INSTAGRAM_ACCOUNT_ID}/media`, {
      image_url: await mediaUrl(env, key),
      is_carousel_item: true,
    });
    if (!item.id || !/^\d+$/.test(item.id)) throw new Error('META_ID');
    await ready(env, item.id);
    children.push(item.id);
  }
  const carousel = await meta(env, `${env.INSTAGRAM_ACCOUNT_ID}/media`, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption: post.caption,
  });
  if (!carousel.id || !/^\d+$/.test(carousel.id)) throw new Error('META_ID');
  await ready(env, carousel.id);
  return carousel.id;
}
