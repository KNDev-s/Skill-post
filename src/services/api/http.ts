import { z } from 'zod';
import { ServiceError } from '../post-service';

export type HttpOptions = { baseUrl: string; timeoutMs: number; credentials: RequestCredentials };
export function createHttpClient(options: HttpOptions, fetcher: typeof fetch = fetch) {
  return async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetcher(`${options.baseUrl}${path}`, {
        method,
        credentials: options.credentials,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json: unknown = await response.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return null;
      });
      if (!response.ok) {
        const error = z
          .object({ error: z.object({ message: z.string(), code: z.string() }) })
          .safeParse(json);
        throw new ServiceError(
          error.success ? error.data.error.message : `A API respondeu com erro ${response.status}.`,
          error.success ? error.data.error.code : 'HTTP_ERROR',
          response.status,
        );
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success)
        throw new ServiceError(
          'O backend retornou uma resposta incompatível. Verifique o contrato da API.',
          'INVALID_RESPONSE',
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (controller.signal.aborted)
        throw new ServiceError(
          'A resposta demorou demais. A operação pode ter sido recebida; atualize o status antes de repetir.',
          'TIMEOUT',
        );
      throw new ServiceError(
        'Não foi possível conectar ao backend. Verifique sua conexão e a configuração da API.',
        'NETWORK',
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
