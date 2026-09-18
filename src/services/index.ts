import { config } from '../config/env';
import { createApiPostService } from './api/post-api';
import type { PostService } from './post-service';

export async function createPostService(): Promise<PostService> {
  if (config.mode === 'mock') {
    const { createMockPostService } = await import('./mocks/post-mock');
    return createMockPostService();
  }
  // Erros da API nunca se transformam em publicações fictícias.
  return createApiPostService(config);
}
