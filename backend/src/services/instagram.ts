import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { Post, Slide } from '../types.js';

export type PublishResult = {
  success: boolean;
  publishedId?: string;
  dryRun?: boolean;
  message?: string;
};

export async function uploadSlideToPublicHost(filePath: string, fileName: string): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', new Blob([fileBuffer], { type: 'image/png' }), fileName);

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Falha no upload para servidor de imagens público: HTTP ${res.status}`);
  }

  const publicUrl = (await res.text()).trim();
  if (!publicUrl.startsWith('https://')) {
    throw new Error(`Servidor de imagens retornou resposta inválida: ${publicUrl}`);
  }

  return publicUrl;
}

export async function ensureSlidePublicUrl(postId: string, slide: Slide): Promise<string> {
  // Se já for uma URL pública HTTPS e não for localhost/127.0.0.1, usa diretamente
  if (
    slide.imageUrl &&
    slide.imageUrl.startsWith('https://') &&
    !slide.imageUrl.includes('localhost') &&
    !slide.imageUrl.includes('127.0.0.1')
  ) {
    return slide.imageUrl;
  }

  // Tenta localizar o arquivo local do slide
  const fileName = `${slide.id}.png`;
  const filePath = path.join(config.slidesDir, postId, fileName);

  if (fs.existsSync(filePath)) {
    console.log(
      `[Instagram Service] Fazendo upload do slide local ${slide.id} para URL pública HTTPS...`,
    );
    const publicUrl = await uploadSlideToPublicHost(filePath, fileName);
    console.log(`[Instagram Service] Slide ${slide.id} hospedado com sucesso em: ${publicUrl}`);
    return publicUrl;
  }

  if (slide.imageUrl) {
    return slide.imageUrl;
  }

  throw new Error(`Imagem do slide ${slide.id} não encontrada para publicação.`);
}

export async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  apiHost: string,
  label = 'Container',
  maxAttempts = 15,
  delayMs = 2500,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = `https://${apiHost}/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status_code?: string;
      status?: string;
      error?: { message: string };
    };

    console.log(
      `[Instagram Service] [${label}] Status do container ${containerId} (tentativa ${attempt}/${maxAttempts}): ${data.status_code || data.status || 'processando'}`,
    );

    if (data.status_code === 'FINISHED') {
      return;
    }

    if (data.status_code === 'ERROR') {
      throw new Error(
        `Falha no processamento da imagem pela Meta: ${data.status || 'Erro no container'}`,
      );
    }

    if (data.status_code === 'EXPIRED') {
      throw new Error('O container de mídia expirou antes da publicação.');
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Tempo limite excedido aguardando processamento do container [${label}].`);
}

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

  try {
    // 1. Assegurar URLs públicas para todos os slides (upload automático se local)
    const resolvedSlides: { slideId: string; url: string }[] = [];
    for (const slide of post.slides) {
      const publicUrl = await ensureSlidePublicUrl(post.id, slide);
      resolvedSlides.push({ slideId: slide.id, url: publicUrl });
    }

    const hasLocalImages = resolvedSlides.some(
      (s) =>
        !s.url ||
        !s.url.startsWith('https://') ||
        s.url.includes('localhost') ||
        s.url.includes('127.0.0.1'),
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

    const containerIds: string[] = [];

    // 2. Criar container de cada slide
    for (const { slideId, url: imageUrl } of resolvedSlides) {
      const url = `https://${config.instagramApiHost}/v21.0/${instagramAccountId}/media`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: instagramAccessToken,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: { message: string } };
      if (!res.ok || !data.id) {
        throw new Error(
          data.error?.message || `Falha ao criar item de carrossel para slide ${slideId}.`,
        );
      }
      containerIds.push(data.id);
    }

    // 3. Aguardar processamento de cada slide individual
    for (let i = 0; i < containerIds.length; i++) {
      await waitForContainerReady(
        containerIds[i],
        instagramAccessToken,
        config.instagramApiHost,
        `Slide ${i + 1}/${containerIds.length}`,
        15,
        2000,
      );
    }

    // 4. Criar container do Carrossel com a legenda
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

    // 5. Aguardar processamento do container do Carrossel
    await waitForContainerReady(
      carouselData.id,
      instagramAccessToken,
      config.instagramApiHost,
      'Carrossel Completo',
      20,
      2500,
    );

    // 6. Efetivar a publicação com retry para absorver propagações da Meta
    let publishedId: string | undefined;
    for (let attempt = 1; attempt <= 5; attempt++) {
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

      if (publishRes.ok && publishData.id) {
        publishedId = publishData.id;
        break;
      }

      const errMsg = publishData.error?.message || '';
      if (
        attempt < 5 &&
        (errMsg.includes('Media ID is not available') || errMsg.includes('not ready'))
      ) {
        console.warn(
          `[Instagram Service] Mídia ainda em propagação (tentativa ${attempt}/5). Aguardando 3s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      throw new Error(errMsg || 'Falha ao publicar carrossel no Instagram.');
    }

    if (!publishedId) {
      throw new Error('Falha ao obter ID de publicação da Meta.');
    }

    return {
      success: true,
      publishedId,
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
