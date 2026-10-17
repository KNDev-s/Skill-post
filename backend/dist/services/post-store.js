import crypto from 'node:crypto';
export class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConflictError';
    }
}
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
export class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}
class PostStore {
    posts = new Map();
    idempotencyCache = new Map();
    getCached(idempotencyKey) {
        if (!idempotencyKey)
            return undefined;
        return this.idempotencyCache.get(idempotencyKey);
    }
    setCached(idempotencyKey, post) {
        this.idempotencyCache.set(idempotencyKey, post);
    }
    get(id) {
        const post = this.posts.get(id);
        if (!post) {
            throw new NotFoundError(`Post com id "${id}" não encontrado.`);
        }
        return post;
    }
    createInitial(brief) {
        const now = new Date().toISOString();
        const id = `post_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const post = {
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
    setReady(id, slides, caption) {
        const post = this.get(id);
        const now = new Date().toISOString();
        const updated = {
            ...post,
            status: 'ready',
            slides,
            caption,
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    setFailed(id, reason) {
        const post = this.get(id);
        const now = new Date().toISOString();
        const updated = {
            ...post,
            status: 'failed',
            failure: reason,
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    assertRevision(post, clientRevision) {
        if (post.revision !== clientRevision) {
            throw new ConflictError(`Conflito de revisão. O post está na revisão ${post.revision}, mas você enviou ${clientRevision}. Atualize antes de continuar.`);
        }
    }
    updateCaption(id, revision, caption) {
        const post = this.get(id);
        this.assertRevision(post, revision);
        const now = new Date().toISOString();
        const updated = {
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
    updateSlide(id, revision, slideId, newSlideData) {
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
        const updated = {
            ...post,
            revision: post.revision + 1,
            slides: updatedSlides,
            status: post.status === 'approved' ? 'ready' : post.status,
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    approve(id, revision) {
        const post = this.get(id);
        this.assertRevision(post, revision);
        if (post.status !== 'ready' && post.status !== 'approved') {
            throw new ConflictError(`Não é possível aprovar um post com status "${post.status}".`);
        }
        const now = new Date().toISOString();
        const updated = {
            ...post,
            status: 'approved',
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    startPublishing(id, revision) {
        const post = this.get(id);
        this.assertRevision(post, revision);
        if (post.status !== 'approved') {
            throw new ConflictError('Apenas posts previamente aprovados podem ser publicados.');
        }
        const now = new Date().toISOString();
        const updated = {
            ...post,
            status: 'publishing',
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    setPublished(id) {
        const post = this.get(id);
        const now = new Date().toISOString();
        const updated = {
            ...post,
            status: 'published',
            publishedAt: now,
            updatedAt: now,
        };
        this.posts.set(id, updated);
        return updated;
    }
    schedule(id, request) {
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
        const updated = {
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
