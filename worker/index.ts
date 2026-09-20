import { ZodError } from 'zod';
import { api } from './api';
import { AppError, type Env } from './env';
import { runJobs } from './jobs';
import { authenticate, secureResponse, verifyMedia } from './security';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (!env.APP_ORIGIN || url.origin !== env.APP_ORIGIN || url.protocol !== 'https:')
        throw new AppError(403, 'HOST', 'Utilize o endereço HTTPS oficial da aplicação.');
      if (url.pathname.startsWith('/media/')) {
        const key = url.pathname.slice(7);
        if (
          request.method !== 'GET' ||
          !/^[a-zA-Z0-9-]+\/\d+\/[a-zA-Z0-9-]+\.jpg$/.test(key) ||
          !(await verifyMedia(env, url, key))
        )
          throw new AppError(403, 'MEDIA_DENIED', 'Link de mídia inválido ou expirado.');
        const object = await env.MEDIA.get(key);
        if (!object) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada.');
        return secureResponse(
          new Response(object.body, { headers: { 'Content-Type': 'image/jpeg' } }),
          true,
        );
      }
      const owner = await authenticate(request, env);
      if (url.pathname.startsWith('/api/'))
        return secureResponse(await api(request, env, owner), true);
      if (!['GET', 'HEAD'].includes(request.method))
        throw new AppError(405, 'METHOD', 'Método não permitido.');
      return secureResponse(await env.ASSETS.fetch(request), true);
    } catch (error) {
      const known = error instanceof AppError;
      const invalid = error instanceof ZodError;
      return secureResponse(
        Response.json(
          {
            error: {
              code: known ? error.code : invalid ? 'VALIDATION' : 'INTERNAL',
              message: known
                ? error.message
                : invalid
                  ? 'Dados inválidos. Revise os campos e tente novamente.'
                  : 'Não foi possível concluir a operação.',
            },
          },
          { status: known ? error.status : invalid ? 400 : 500 },
        ),
        true,
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await runJobs(env);
  },
} satisfies ExportedHandler<Env>;
