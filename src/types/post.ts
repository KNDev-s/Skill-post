import { z } from 'zod';

export const tones = {
  educativo: 'Educativo',
  inspirador: 'Inspirador',
  direto: 'Direto ao ponto',
  descontraido: 'Descontraído',
} as const;
export const objectives = {
  autoridade: 'Construir autoridade',
  leads: 'Gerar leads',
  engajamento: 'Gerar engajamento',
  produto: 'Apresentar uma solução',
} as const;
export const generatePostSchema = z.object({
  topic: z.string().trim().min(5, 'Descreva o tema com pelo menos 5 caracteres.').max(300),
  slideCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  tone: z.enum(['educativo', 'inspirador', 'direto', 'descontraido']),
  objective: z.enum(['autoridade', 'leads', 'engajamento', 'produto']),
});
export const statusSchema = z.enum([
  'generating',
  'ready',
  'approved',
  'publishing',
  'scheduled',
  'published',
  'failed',
]);
export const statusLabels: Record<z.infer<typeof statusSchema>, string> = {
  generating: 'Gerando',
  ready: 'Pronto',
  approved: 'Aprovado',
  publishing: 'Publicando',
  scheduled: 'Agendado',
  published: 'Publicado',
  failed: 'Falha',
};
export const slideSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300),
  body: z.string().max(2000),
  layout: z.enum(['cover', 'content', 'closing']),
  // A imagem final é criada pelo renderer do backend; HTML local é apenas preview.
  imageUrl: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//.test(v))
    .optional(),
});
export const postSchema = z
  .object({
    id: z.string().min(1),
    revision: z.number().int().positive(),
    status: statusSchema,
    brief: generatePostSchema,
    slides: z.array(slideSchema).max(10),
    caption: z.string().max(2200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    scheduledAt: z.string().datetime().optional(),
    timeZone: z.string().optional(),
    publishedAt: z.string().datetime().optional(),
    failure: z.string().optional(),
  })
  .superRefine((post, ctx) => {
    if (
      !['generating', 'failed'].includes(post.status) &&
      post.slides.length !== post.brief.slideCount
    )
      ctx.addIssue({ code: 'custom', message: 'Número de slides incompatível com o briefing.' });
    if (new Set(post.slides.map((s) => s.id)).size !== post.slides.length)
      ctx.addIssue({ code: 'custom', message: 'IDs de slides duplicados.' });
    if (post.status === 'scheduled' && (!post.scheduledAt || !post.timeZone))
      ctx.addIssue({ code: 'custom', message: 'Agendamento sem data ou fuso.' });
    if (post.status === 'published' && !post.publishedAt)
      ctx.addIssue({ code: 'custom', message: 'Publicação sem data.' });
  });
export const postResponseSchema = z.object({ data: postSchema });
export type GeneratePostRequest = z.infer<typeof generatePostSchema>;
export type Post = z.infer<typeof postSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type PostStatus = Post['status'];
export type PostResponse = z.infer<typeof postResponseSchema>;
export type RevisionRequest = { revision: number };
export type UpdateCaptionRequest = RevisionRequest & { caption: string };
export type SchedulePostRequest = RevisionRequest & { scheduledAt: string; timeZone: string };
export type ApiErrorResponse = { error: { code: string; message: string; requestId?: string } };
