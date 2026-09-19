import type { FastifyPluginAsync } from 'fastify';
import {
  generatePostSchema,
  revisionRequestSchema,
  schedulePostSchema,
  type Slide,
  updateCaptionSchema,
} from '../types.js';
import {
  generateCarouselContent,
  regenerateSingleSlideContent,
} from '../services/ai-generator.js';
import { publishToInstagram } from '../services/instagram.js';
import {
  ConflictError,
  NotFoundError,
  postStore,
  ValidationError,
} from '../services/post-store.js';
import { renderAllSlides, renderSlideImage } from '../services/renderer.js';

export const postRoutes: FastifyPluginAsync = async (fastify) => {
  // Tratamento de erros customizados
  fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof NotFoundError) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    if (error instanceof ConflictError) {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: error.message },
      });
    }
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION', message: error.message },
      });
    }
    request.log.error(error);
    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Ocorreu um erro interno no servidor.',
      },
    });
  });

  // 1. POST /posts - Iniciar geração de carrossel
  fastify.post('/posts', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const cached = postStore.getCached(idempotencyKey);
    if (cached) {
      return reply.send({ data: cached });
    }

    const parsedBrief = generatePostSchema.safeParse(request.body);
    if (!parsedBrief.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: parsedBrief.error.errors[0]?.message || 'Parâmetros inválidos.',
        },
      });
    }

    const brief = parsedBrief.data;
    const initialPost = postStore.createInitial(brief);

    if (idempotencyKey) {
      postStore.setCached(idempotencyKey, initialPost);
    }

    // Executa geração e renderização de forma assíncrona
    (async () => {
      try {
        const { slides: generatedSlides, caption } =
          await generateCarouselContent(brief);

        const slidesWithIds: Slide[] = generatedSlides.map((s, idx) => ({
          ...s,
          id: `slide_${idx + 1}`,
        }));

        // Renderizar imagens PNG em 1080x1350
        const renderedSlides = await renderAllSlides(initialPost.id, slidesWithIds);

        postStore.setReady(initialPost.id, renderedSlides, caption);
      } catch (err) {
        request.log.error(err, 'Erro durante geração do carrossel');
        postStore.setFailed(
          initialPost.id,
          err instanceof Error ? err.message : 'Falha na geração com IA.',
        );
      }
    })();

    // Retorna 202 com status "generating" (polling da tela irá buscar assim que estiver pronto)
    return reply.status(202).send({ data: initialPost });
  });

  // 2. GET /posts/:id - Consultar status do post
  fastify.get<{ Params: { id: string } }>('/posts/:id', async (request, reply) => {
    const post = postStore.get(request.params.id);
    return reply.send({ data: post });
  });

  // 3. POST /posts/:id/regenerate - Regenerar todo o carrossel
  fastify.post<{ Params: { id: string } }>(
    '/posts/:id/regenerate',
    async (request, reply) => {
      const parsedBody = revisionRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION', message: 'Revisão obrigatória.' },
        });
      }

      const post = postStore.get(request.params.id);
      postStore.assertRevision(post, parsedBody.data.revision);

      // Marca como generating e incrementa revisão
      const now = new Date().toISOString();
      const generatingPost = {
        ...post,
        revision: post.revision + 1,
        status: 'generating' as const,
        updatedAt: now,
      };
      (postStore as unknown as { posts: Map<string, typeof post> }).posts.set(
        post.id,
        generatingPost,
      );

      (async () => {
        try {
          const { slides: generatedSlides, caption } =
            await generateCarouselContent(post.brief);
          const slidesWithIds: Slide[] = generatedSlides.map((s, idx) => ({
            ...s,
            id: `slide_${idx + 1}`,
          }));
          const renderedSlides = await renderAllSlides(post.id, slidesWithIds);
          postStore.setReady(post.id, renderedSlides, caption);
        } catch (err) {
          postStore.setFailed(
            post.id,
            err instanceof Error ? err.message : 'Falha ao regenerar carrossel.',
          );
        }
      })();

      return reply.status(202).send({ data: generatingPost });
    },
  );

  // 4. POST /posts/:id/slides/:slideId/regenerate - Regenerar um slide específico
  fastify.post<{ Params: { id: string; slideId: string } }>(
    '/posts/:id/slides/:slideId/regenerate',
    async (request, reply) => {
      const parsedBody = revisionRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION', message: 'Revisão obrigatória.' },
        });
      }

      const { id, slideId } = request.params;
      const post = postStore.get(id);
      postStore.assertRevision(post, parsedBody.data.revision);

      const slideIndex = post.slides.findIndex((s) => s.id === slideId);
      if (slideIndex === -1) {
        throw new NotFoundError(`Slide "${slideId}" não encontrado.`);
      }

      const existingSlide = post.slides[slideIndex];
      const regeneratedContent = await regenerateSingleSlideContent(
        post.brief,
        slideIndex,
        post.slides.length,
        existingSlide,
      );

      const tempSlide: Slide = {
        ...regeneratedContent,
        id: slideId,
      };

      // Renderiza nova imagem do slide
      const imageUrl = await renderSlideImage(
        id,
        tempSlide,
        slideIndex,
        post.slides.length,
      );

      const updatedPost = postStore.updateSlide(id, parsedBody.data.revision, slideId, {
        ...regeneratedContent,
        imageUrl,
      });

      return reply.send({ data: updatedPost });
    },
  );

  // 5. PATCH /posts/:id/caption - Editar legenda
  fastify.patch<{ Params: { id: string } }>('/posts/:id/caption', async (request, reply) => {
    const parsedBody = updateCaptionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION', message: 'Legenda e revisão são obrigatórias.' },
      });
    }

    const { revision, caption } = parsedBody.data;
    const updatedPost = postStore.updateCaption(request.params.id, revision, caption);
    return reply.send({ data: updatedPost });
  });

  // 6. POST /posts/:id/approve - Aprovar post
  fastify.post<{ Params: { id: string } }>('/posts/:id/approve', async (request, reply) => {
    const parsedBody = revisionRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION', message: 'Revisão obrigatória.' },
      });
    }

    const updatedPost = postStore.approve(request.params.id, parsedBody.data.revision);
    return reply.send({ data: updatedPost });
  });

  // 7. POST /posts/:id/publish - Publicar carrossel no Instagram
  fastify.post<{ Params: { id: string } }>('/posts/:id/publish', async (request, reply) => {
    const parsedBody = revisionRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION', message: 'Revisão obrigatória.' },
      });
    }

    const { id } = request.params;
    const publishingPost = postStore.startPublishing(id, parsedBody.data.revision);

    // Executa a publicação no Instagram de forma assíncrona
    (async () => {
      try {
        const result = await publishToInstagram(publishingPost);
        if (result.success) {
          postStore.setPublished(id);
        } else {
          postStore.setFailed(
            id,
            result.message || 'Falha na publicação com o Instagram.',
          );
        }
      } catch (err) {
        postStore.setFailed(
          id,
          err instanceof Error ? err.message : 'Falha na publicação.',
        );
      }
    })();

    return reply.status(202).send({ data: publishingPost });
  });

  // 8. POST /posts/:id/schedule - Agendar post
  fastify.post<{ Params: { id: string } }>('/posts/:id/schedule', async (request, reply) => {
    const parsedBody = schedulePostSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: parsedBody.error.errors[0]?.message || 'Dados de agendamento inválidos.',
        },
      });
    }

    const updatedPost = postStore.schedule(request.params.id, parsedBody.data);
    return reply.send({ data: updatedPost });
  });
};
