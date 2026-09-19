import crypto from 'node:crypto';
import type {
  GeneratePostRequest,
  Post,
  SchedulePostRequest,
  Slide,
} from '../types.js';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class PostStore {
  private posts = new Map<string, Post>();
  private idempotencyCache = new Map<string, Post>();

  getCached(idempotencyKey?: string): Post | undefined {
    if (!idempotencyKey) return undefined;
    return this.idempotencyCache.get(idempotencyKey);
  }

  setCached(idempotencyKey: string, post: Post): void {
    this.idempotencyCache.set(idempotencyKey, post);
  }

  get(id: string): Post {
    const post = this.posts.get(id);
    if (!post) {
      throw new NotFoundError(`Post com id "${id}" não encontrado.`);
    }
    return post;
  }

  createInitial(brief: GeneratePostRequest): Post {
    const now = new Date().toISOString();
    const id = `post_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const post: Post = {
      id,
      revision: 1,
      status: 'generating',
      brief,
      slides: [],
      caption: '',
      createdAt: now,
      updatedAt: now,
    };

    this.posts.set(id, post);
    return post;
  }

  setReady(id: string, slides: Slide[], caption: string): Post {
    const post = this.get(id);
    const now = new Date().toISOString();

    const updated: Post = {
      ...post,
      status: 'ready',
      slides,
      caption,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  setFailed(id: string, reason: string): Post {
    const post = this.get(id);
    const now = new Date().toISOString();

    const updated: Post = {
      ...post,
      status: 'failed',
      failure: reason,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  assertRevision(post: Post, clientRevision: number): void {
    if (post.revision !== clientRevision) {
      throw new ConflictError(
        `Conflito de revisão. O post está na revisão ${post.revision}, mas você enviou ${clientRevision}. Atualize antes de continuar.`,
      );
    }
  }

  updateCaption(id: string, revision: number, caption: string): Post {
    const post = this.get(id);
    this.assertRevision(post, revision);

    const now = new Date().toISOString();
    const updated: Post = {
      ...post,
      revision: post.revision + 1,
      caption,
      // Qualquer edição invalida a aprovação prévia
      status: post.status === 'approved' ? 'ready' : post.status,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  updateSlide(id: string, revision: number, slideId: string, newSlideData: Partial<Slide>): Post {
    const post = this.get(id);
    this.assertRevision(post, revision);

    const slideIndex = post.slides.findIndex((s) => s.id === slideId);
    if (slideIndex === -1) {
      throw new NotFoundError(`Slide "${slideId}" não encontrado no post.`);
    }

    const updatedSlides = [...post.slides];
    updatedSlides[slideIndex] = {
      ...updatedSlides[slideIndex],
      ...newSlideData,
    };

    const now = new Date().toISOString();
    const updated: Post = {
      ...post,
      revision: post.revision + 1,
      slides: updatedSlides,
      status: post.status === 'approved' ? 'ready' : post.status,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  approve(id: string, revision: number): Post {
    const post = this.get(id);
    this.assertRevision(post, revision);

    if (post.status !== 'ready' && post.status !== 'approved') {
      throw new ConflictError(`Não é possível aprovar um post com status "${post.status}".`);
    }

    const now = new Date().toISOString();
    const updated: Post = {
      ...post,
      status: 'approved',
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  startPublishing(id: string, revision: number): Post {
    const post = this.get(id);
    this.assertRevision(post, revision);

    if (post.status !== 'approved') {
      throw new ConflictError('Apenas posts previamente aprovados podem ser publicados.');
    }

    const now = new Date().toISOString();
    const updated: Post = {
      ...post,
      status: 'publishing',
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  setPublished(id: string): Post {
    const post = this.get(id);
    const now = new Date().toISOString();

    const updated: Post = {
      ...post,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }

  schedule(id: string, request: SchedulePostRequest): Post {
    const post = this.get(id);
    this.assertRevision(post, request.revision);

    if (post.status !== 'approved') {
      throw new ConflictError('Apenas posts previamente aprovados podem ser agendados.');
    }

    const scheduledDate = new Date(request.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      throw new ValidationError('A data de agendamento deve ser no futuro.');
    }

    const now = new Date().toISOString();
    const updated: Post = {
      ...post,
      status: 'scheduled',
      scheduledAt: request.scheduledAt,
      timeZone: request.timeZone,
      updatedAt: now,
    };

    this.posts.set(id, updated);
    return updated;
  }
}

export const postStore = new PostStore();
