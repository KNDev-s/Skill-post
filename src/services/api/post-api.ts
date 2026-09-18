import type { PostService } from '../post-service';
import { generatePostSchema, postResponseSchema } from '../../types/post';
import { createHttpClient, type HttpOptions } from './http';

export function createApiPostService(options: HttpOptions, fetcher?: typeof fetch): PostService {
  const http = createHttpClient(options, fetcher);
  const postPath = (id: string) => `/posts/${encodeURIComponent(id)}`;
  const call = async (path: string, method = 'GET', body?: unknown) =>
    (await http(path, postResponseSchema, method, body)).data;
  return {
    generatePost: (request) => call('/posts', 'POST', generatePostSchema.parse(request)),
    getPost: (id) => call(postPath(id)),
    regeneratePost: (id, request) => call(`${postPath(id)}/regenerate`, 'POST', request),
    regenerateSlide: (id, slideId, request) =>
      call(`${postPath(id)}/slides/${encodeURIComponent(slideId)}/regenerate`, 'POST', request),
    updateCaption: (id, request) => call(`${postPath(id)}/caption`, 'PATCH', request),
    approvePost: (id, request) => call(`${postPath(id)}/approve`, 'POST', request),
    publishPost: (id, request) => call(`${postPath(id)}/publish`, 'POST', request),
    schedulePost: (id, request) => call(`${postPath(id)}/schedule`, 'POST', request),
  };
}
