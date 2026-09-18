import {
  generatePostSchema,
  postSchema,
  type GeneratePostRequest,
  type Post,
} from '../../types/post';
import { ServiceError, type PostService } from '../post-service';

// Adapter de demonstração isolado. Não executa skill, IA, renderer ou publicação.
export function createMockPostService(delayMs = 650): PostService {
  const posts = new Map<string, Post>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  const now = () => new Date().toISOString();
  const copy = (post: Post) => structuredClone(post);
  const get = (id: string) => {
    const post = posts.get(id);
    if (!post)
      throw new ServiceError(
        'Este post de demonstração não está mais disponível. Gere um novo.',
        'NOT_FOUND',
        404,
      );
    return post;
  };
  const mutate = async (
    id: string,
    revision: number,
    statuses: Post['status'][],
    update: (post: Post) => Post,
  ) => {
    await wait();
    const post = get(id);
    if (post.revision !== revision)
      throw new ServiceError(
        'O post foi atualizado. Atualize o status antes de continuar.',
        'CONFLICT',
        409,
      );
    if (!statuses.includes(post.status))
      throw new ServiceError(
        'Esta ação não está disponível no estado atual.',
        'INVALID_STATE',
        409,
      );
    const next = postSchema.parse({
      ...update(copy(post)),
      revision: post.revision + 1,
      updatedAt: now(),
    });
    posts.set(id, next);
    return copy(next);
  };
  const slides = (brief: GeneratePostRequest) =>
    Array.from({ length: brief.slideCount }, (_, i) => ({
      id: crypto.randomUUID(),
      layout:
        i === 0
          ? ('cover' as const)
          : i === brief.slideCount - 1
            ? ('closing' as const)
            : ('content' as const),
      title:
        i === 0
          ? brief.topic
          : i === brief.slideCount - 1
            ? 'Sua próxima evolução começa com uma conversa.'
            : [
                'Menos tarefas repetitivas. Mais possibilidades.',
                'Comece pelo que consome seu tempo.',
                'Conecte processos. Simplifique a rotina.',
                'Tecnologia que acompanha seu negócio.',
              ][(i - 1) % 4],
      body:
        i === 0
          ? 'Ideias práticas para transformar o jeito de trabalhar.'
          : i === brief.slideCount - 1
            ? "Vamos construir o próximo passo juntos? Conheça a KNDev's."
            : `Exemplo ${i}: identifique uma oportunidade, escolha um processo e acompanhe os resultados. Conteúdo ilustrativo para revisar o fluxo.`,
    }));
  return {
    async generatePost(request) {
      const brief = generatePostSchema.parse(request);
      await wait();
      const post = postSchema.parse({
        id: crypto.randomUUID(),
        revision: 1,
        status: 'ready',
        brief,
        slides: slides(brief),
        caption: `${brief.topic}\n\nGrandes mudanças começam com um primeiro passo. Qual processo você simplificaria hoje?\n\nConteúdo de demonstração · Tom: ${brief.tone} · Objetivo: ${brief.objective}\n\n#KNDevs #Tecnologia #Inovação`,
        createdAt: now(),
        updatedAt: now(),
      });
      posts.set(post.id, post);
      return copy(post);
    },
    async getPost(id) {
      await wait();
      return copy(get(id));
    },
    regeneratePost: (id, request) =>
      mutate(id, request.revision, ['ready', 'approved', 'failed'], (p) => ({
        ...p,
        status: 'ready',
        failure: undefined,
        slides: slides(p.brief).map((s) => ({
          ...s,
          title: s.layout === 'cover' ? `${p.brief.topic} — um novo olhar` : s.title,
        })),
      })),
    regenerateSlide: (id, slideId, request) =>
      mutate(id, request.revision, ['ready', 'approved'], (p) => {
        if (!p.slides.some((s) => s.id === slideId))
          throw new ServiceError('Slide não encontrado.', 'NOT_FOUND', 404);
        return {
          ...p,
          status: 'ready',
          slides: p.slides.map((s) =>
            s.id === slideId
              ? {
                  ...s,
                  title: `Um novo olhar: ${p.brief.topic}`,
                  body: `Variação de demonstração ${p.revision + 1}. Transforme uma ideia em um próximo passo concreto.`,
                  imageUrl: undefined,
                }
              : s,
          ),
        };
      }),
    updateCaption: (id, request) =>
      mutate(id, request.revision, ['ready', 'approved'], (p) => {
        if (!request.caption.trim() || request.caption.length > 2200)
          throw new ServiceError('A legenda precisa ter de 1 a 2.200 caracteres.', 'VALIDATION');
        return { ...p, caption: request.caption, status: 'ready' };
      }),
    approvePost: (id, request) =>
      mutate(id, request.revision, ['ready'], (p) => ({ ...p, status: 'approved' })),
    publishPost: (id, request) =>
      mutate(id, request.revision, ['approved'], (p) => ({
        ...p,
        status: 'published',
        publishedAt: now(),
      })),
    schedulePost: (id, request) =>
      mutate(id, request.revision, ['approved'], (p) => {
        if (
          !Number.isFinite(Date.parse(request.scheduledAt)) ||
          Date.parse(request.scheduledAt) <= Date.now()
        )
          throw new ServiceError('Escolha uma data e horário no futuro.', 'VALIDATION');
        try {
          new Intl.DateTimeFormat('pt-BR', { timeZone: request.timeZone });
        } catch {
          throw new ServiceError('Fuso horário inválido.', 'VALIDATION');
        }
        return {
          ...p,
          status: 'scheduled',
          scheduledAt: request.scheduledAt,
          timeZone: request.timeZone,
        };
      }),
  };
}
