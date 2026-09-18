import { describe, expect, it, vi } from 'vitest';
import { createMockPostService } from './mocks/post-mock';
import { createApiPostService } from './api/post-api';
import { parseConfig } from '../config/env';
import type { GeneratePostRequest } from '../types/post';

const brief: GeneratePostRequest = {
  topic: 'Automação para pequenos negócios',
  slideCount: 5,
  tone: 'educativo',
  objective: 'leads',
};

describe('fluxo de aprovação e publicação', () => {
  it('exige aprovação, invalida após edição, rejeita revisão antiga e impede publicação duplicada', async () => {
    const service = createMockPostService(0);
    const post = await service.generatePost(brief);
    expect(post.slides).toHaveLength(5);
    await expect(service.publishPost(post.id, post)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    const approved = await service.approvePost(post.id, post);
    const edited = await service.updateCaption(post.id, {
      ...approved,
      caption: 'Uma nova legenda',
    });
    expect(edited.status).toBe('ready');
    await expect(service.publishPost(post.id, approved)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const again = await service.approvePost(post.id, edited);
    const published = await service.publishPost(post.id, again);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    await expect(service.publishPost(post.id, published)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(service.regeneratePost(post.id, published)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });
  it('regenera só o slide escolhido e invalida aprovação', async () => {
    const service = createMockPostService(0);
    const post = await service.generatePost(brief);
    const approved = await service.approvePost(post.id, post);
    const result = await service.regenerateSlide(post.id, post.slides[1].id, approved);
    expect(result.status).toBe('ready');
    expect(result.slides[0]).toEqual(post.slides[0]);
    expect(result.slides[1].title).not.toBe(post.slides[1].title);
    expect(result.slides[2]).toEqual(post.slides[2]);
    await expect(service.regenerateSlide(post.id, 'missing', result)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('valida agendamento e mantém instante UTC e fuso IANA', async () => {
    const service = createMockPostService(0);
    const post = await service.generatePost(brief);
    const approved = await service.approvePost(post.id, post);
    await expect(
      service.schedulePost(post.id, {
        ...approved,
        scheduledAt: '2000-01-01T10:00:00Z',
        timeZone: 'America/Sao_Paulo',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const result = await service.schedulePost(post.id, {
      ...approved,
      scheduledAt,
      timeZone: 'America/Sao_Paulo',
    });
    expect(result).toMatchObject({
      status: 'scheduled',
      scheduledAt,
      timeZone: 'America/Sao_Paulo',
    });
    await expect(
      service.schedulePost(post.id, { ...result, scheduledAt, timeZone: 'America/Sao_Paulo' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it.each([3, 5, 7, 10] as const)(
    'respeita %i slides e não permite mutação externa',
    async (count) => {
      const service = createMockPostService(0);
      const post = await service.generatePost({ ...brief, slideCount: count });
      expect(post.slides).toHaveLength(count);
      post.slides.pop();
      expect((await service.getPost(post.id)).slides).toHaveLength(count);
    },
  );
});

describe('adapter HTTP', () => {
  it('envia DTO, revisão, credenciais e chave de idempotência', async () => {
    const fixture = await createMockPostService(0).generatePost(brief);
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: fixture }), { status: 200 }));
    const service = createApiPostService(
      { baseUrl: 'https://api.example.test/v1', credentials: 'include', timeoutMs: 2000 },
      fetcher,
    );
    await service.schedulePost('id/with space', {
      revision: 2,
      scheduledAt: '2030-01-01T12:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/posts/id%2Fwith%20space/schedule');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) },
    });
    expect(JSON.parse(options.body)).toEqual({
      revision: 2,
      scheduledAt: '2030-01-01T12:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    });
  });
  it('exibe erro real sem fallback para publicação simulada', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'CONFLICT', message: 'Revisão desatualizada' } }),
          { status: 409 },
        ),
      );
    const service = createApiPostService(
      { baseUrl: '/api/v1', credentials: 'same-origin', timeoutMs: 100 },
      fetcher,
    );
    await expect(service.publishPost('123', { revision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{ data: {} }, { data: { status: 'published' } }, '<html>SPA fallback</html>'])(
    'rejeita resposta incompatível',
    async (response) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response(typeof response === 'string' ? response : JSON.stringify(response)),
        );
      const service = createApiPostService(
        { baseUrl: '/api/v1', credentials: 'same-origin', timeoutMs: 100 },
        fetcher,
      );
      await expect(service.getPost('123')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    },
  );
  it('trata falha de rede sem repetir a escrita', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const service = createApiPostService(
      { baseUrl: '/api/v1', credentials: 'same-origin', timeoutMs: 100 },
      fetcher,
    );
    await expect(service.generatePost(brief)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancela timeout e não afirma que a operação foi desfeita', async () => {
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const service = createApiPostService(
      { baseUrl: '/api/v1', credentials: 'same-origin', timeoutMs: 10 },
      fetcher,
    );
    await expect(service.generatePost(brief)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('configuração', () => {
  it('usa mock no desenvolvimento e API em produção por padrão', () => {
    expect(parseConfig({ DEV: true }).mode).toBe('mock');
    expect(parseConfig({ DEV: false }).mode).toBe('api');
    expect(parseConfig({ DEV: false, VITE_SERVICE_MODE: 'mock' }).mode).toBe('mock');
  });
  it('rejeita URL e modo inválidos', () => {
    expect(() => parseConfig({ VITE_SERVICE_MODE: 'auto' })).toThrow();
    expect(() => parseConfig({ VITE_API_BASE_URL: 'javascript:alert(1)' })).toThrow();
    expect(() => parseConfig({ VITE_API_BASE_URL: '//api.example.test' })).toThrow();
    expect(() => parseConfig({ VITE_API_TIMEOUT_MS: 'invalid' })).toThrow();
  });
});
