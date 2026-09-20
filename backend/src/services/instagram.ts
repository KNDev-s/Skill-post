import { config } from '../config.js';
import type { Post } from '../types.js';

export type PublishResult = {
  success: boolean;
  publishedId?: string;
  dryRun?: boolean;
  message?: string;
};

export async function publishToInstagram(post: Post): Promise<PublishResult> {
  const { instagramAccessToken, instagramAccountId } = config;

  if (!instagramAccessToken || !instagramAccountId) {
    console.log(
      `[Instagram Service] Publicação bloqueada: credenciais não configuradas para o post ${post.id}.`,
    );
    return {
      success: false,
      message:
        'Publicação não realizada. Configure INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_ACCOUNT_ID no backend.',
    };
  }

  // Verifica se as URLs das imagens são públicas (Meta não consegue acessar localhost diretamente)
  const hasLocalImages = post.slides.some(
    (s) => !s.imageUrl || s.imageUrl.includes('localhost') || s.imageUrl.includes('127.0.0.1'),
  );

  if (hasLocalImages) {
    console.warn(
      '[Instagram Service] Publicação bloqueada: as imagens precisam estar acessíveis à Meta.',
    );
    return {
      success: false,
      message:
        'Publicação não realizada. Hospede as imagens em URLs HTTPS acessíveis à Meta antes de publicar.',
    };
  }

  try {
    const containerIds: string[] = [];

    // 1. Criar container de cada slide
    for (const slide of post.slides) {
      const url = `https://${config.instagramApiHost}/v21.0/${instagramAccountId}/media`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: slide.imageUrl,
          is_carousel_item: true,
          access_token: instagramAccessToken,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: { message: string } };
      if (!res.ok || !data.id) {
        throw new Error(
          data.error?.message || `Falha ao criar item de carrossel para slide ${slide.id}.`,
        );
      }
      containerIds.push(data.id);
    }

    // 2. Criar container do Carrossel com a legenda
    const carouselRes = await fetch(
      `https://${config.instagramApiHost}/v21.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: containerIds.join(','),
          caption: post.caption,
          access_token: instagramAccessToken,
        }),
      },
    );

    const carouselData = (await carouselRes.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!carouselRes.ok || !carouselData.id) {
      throw new Error(carouselData.error?.message || 'Falha ao criar container do carrossel.');
    }

    // 3. Efetivar a publicação
    const publishRes = await fetch(
      `https://${config.instagramApiHost}/v21.0/${instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselData.id,
          access_token: instagramAccessToken,
        }),
      },
    );

    const publishData = (await publishRes.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!publishRes.ok || !publishData.id) {
      throw new Error(publishData.error?.message || 'Falha ao publicar carrossel no Instagram.');
    }

    return {
      success: true,
      publishedId: publishData.id,
      dryRun: false,
      message: 'Post publicado com sucesso no Instagram!',
    };
  } catch (error) {
    console.error('[Instagram Service] Erro na publicação da Meta:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro na Meta Graph API.',
    };
  }
}
