import type { Slide } from '../src/types/post';
import type { Env } from './env';
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export interface ArtAssets {
  logo: string;
  inter: string;
  heading: string;
}
export function slideHtml(slide: Slide, index: number, total: number, assets: ArtAssets) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>
  @font-face{font-family:Inter;src:url('${assets.inter}')}@font-face{font-family:Space;src:url('${assets.heading}');font-weight:700}
  *{box-sizing:border-box}body{margin:0;width:1080px;height:1350px;padding:100px 90px;background:#071426;color:#FEFEFE;display:flex;flex-direction:column;font-family:Inter,sans-serif}
  .top{display:flex;align-items:center;justify-content:space-between;color:#F3F6FF;font-size:18px;letter-spacing:3px}.mark{width:60px;height:7px;background:#F9543B}
  main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:40px;min-height:0}.kicker{font-size:21px;letter-spacing:3px;color:#F3F6FF}
  h1{font:700 ${slide.title.length > 70 ? 60 : 72}px/1.12 Space,sans-serif;letter-spacing:-2px;margin:0;overflow-wrap:anywhere}p{font:400 30px/1.5 Inter,sans-serif;margin:0;color:#F3F6FF;white-space:normal;overflow-wrap:anywhere}
  footer{display:flex;align-items:center;justify-content:space-between;padding-top:38px;border-top:2px solid #1739DA}footer img{width:250px;height:auto}footer span{font-size:20px;color:#F3F6FF}
  </style></head><body><div class="top"><span>TECNOLOGIA QUE RESOLVE</span><span class="mark"></span></div><main><div class="kicker">${slide.layout === 'cover' ? 'KNDEV’S SOLUTIONS' : slide.layout === 'closing' ? 'VAMOS CONVERSAR?' : 'IDEIAS PARA COLOCAR EM PRÁTICA'}</div><h1>${escapeHtml(slide.title)}</h1><p>${escapeHtml(slide.body)}</p></main><footer><img src="${assets.logo}" alt="KNDev’s Solutions"><span>${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></footer></body></html>`;
}
export async function artAssets(env: Env): Promise<ArtAssets> {
  async function data(path: string, type: string) {
    const response = await env.ASSETS.fetch(`${env.APP_ORIGIN}${path}`);
    if (!response.ok) throw new Error('ART_ASSET');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let raw = '';
    for (const byte of bytes) raw += String.fromCharCode(byte);
    return `data:${type};base64,${btoa(raw)}`;
  }
  const [logo, inter, heading] = await Promise.all([
    data('/brand/logo-dark.png', 'image/png'),
    data('/brand/inter-latin-400-normal.woff2', 'font/woff2'),
    data('/brand/space-grotesk-latin-700-normal.woff2', 'font/woff2'),
  ]);
  return { logo, inter, heading };
}
export async function renderSlide(
  env: Env,
  slide: Slide,
  index: number,
  total: number,
  postId: string,
  revision: number,
  assets: ArtAssets,
) {
  const html = slideHtml(slide, index, total, assets);
  for (const type of ['png', 'jpeg'] as const) {
    const response = await env.BROWSER.quickAction('screenshot', {
      html,
      viewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
      screenshotOptions: { type, ...(type === 'jpeg' ? { quality: 92 } : {}), fullPage: false },
      gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
      rejectResourceTypes: ['script', 'xhr', 'fetch', 'websocket'],
    });
    if (!response.ok || !response.headers.get('Content-Type')?.includes(`image/${type}`))
      throw new Error('RENDER_FAILED');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1000 || bytes.byteLength > 8 * 1024 * 1024)
      throw new Error('RENDER_SIZE');
    await env.MEDIA.put(
      `${postId}/${revision}/${slide.id}.${type === 'jpeg' ? 'jpg' : 'png'}`,
      bytes,
      { httpMetadata: { contentType: `image/${type}` } },
    );
  }
  return {
    ...slide,
    imageUrl: `${env.APP_ORIGIN}/api/v1/posts/${postId}/media/${slide.id}/${revision}.png`,
  };
}
