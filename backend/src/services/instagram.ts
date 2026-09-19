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
      `[Instagram Service] Tokens da Meta não configurados. Modo Simulação/Sandbox ativado para o post ${post.id}.`,
    );
    return {
      success: true,
      dryRun: true,
      publishedId: `mock_ig_${Date.now()}`,
      message:
        'Publicação simulada com sucesso! Para postar na conta real, preencha INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_ACCOUNT_ID no arquivo backend/.env.',
    };
  }

  // Verifica se as URLs das imagens são públicas (Meta não consegue acessar localhost diretamente)
  const hasLocalImages = post.slides.some(
    (s) => !s.imageUrl || s.imageUrl.includes('localhost') || s.imageUrl.includes('127.0.0.1'),
  );

  if (hasLocalImages) {
    console.warn(
      '[Instagram Service] As imagens estão hospedadas em localhost. A Meta Graph API exige URLs HTTPS públicas (ex: Cloudflare Tunnel, R2 ou S3) para baixar as imagens. Executando em modo de teste/sandbox.',
    );
    return {
      success: true,
      dryRun: true,
      publishedId: `local_ig_${Date.now()}`,
      message:
        'Imagens geradas localmente. Para o Instagram da Meta baixá-las, exponha a pasta via túnel HTTPS ou configure Cloudflare R2 / S3.',
    };
  }

  try {
    const containerIds: string[] = [];

    // 1. Criar container de cada slide
    for (const slide of post.slides) {
      const url = `https://graph.facebook.com/v21.0/${instagramAccountId}/media`;
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
      `https://graph.facebook.com/v21.0/${instagramAccountId}/media`,
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
      throw new Error(
        carouselData.error?.message || 'Falha ao criar container do carrossel.',
      );
    }

    // 3. Efetivar a publicação
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/media_publish`,
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
      throw new Error(
        publishData.error?.message || 'Falha ao publicar carrossel no Instagram.',
      );
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
