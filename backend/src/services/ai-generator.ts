import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { config } from '../config.js';
import type { GeneratePostRequest, Slide } from '../types.js';

let cachedSkillInstructions = '';

async function loadAllSkillInstructions(): Promise<string> {
  if (cachedSkillInstructions) return cachedSkillInstructions;
  try {
    const files = ['SKILL.md', 'BRAND.md', 'SOCIAL_SKILL.md', 'OUTPUT_RULES.md'];
    const contents = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(config.skillDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return `=== DIRETRIZ OFICIAL: ${file} ===\n${content}`;
        } catch {
          return '';
        }
      }),
    );
    cachedSkillInstructions = contents.filter(Boolean).join('\n\n');
  } catch (err) {
    console.error('Erro ao carregar arquivos da pasta skill:', err);
    cachedSkillInstructions = '';
  }
  return cachedSkillInstructions;
}

export async function generateCarouselContent(
  brief: GeneratePostRequest,
): Promise<{ slides: Omit<Slide, 'id'>[]; caption: string }> {
  const skillGuidelines = await loadAllSkillInstructions();

  if (!config.openaiApiKey) {
    console.warn(
      '[AI Generator] OPENAI_API_KEY não configurada em backend/.env. Usando gerador determinístico inteligente de fallback.',
    );
    return generateFallbackContent(brief);
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const systemPrompt = `
Você é o especialista sênior em Social Media, Copywriting e Direção de Arte da KNDev's Solutions.
Sua missão é criar o conteúdo completo de um carrossel de alto impacto para o Instagram da KNDev's, seguindo RIGOROSAMENTE todas as diretrizes da marca e as regras de formato abaixo.

${skillGuidelines}

REGRAS DE FORMATAÇÃO E SAÍDA JSON:
1. Retorne EXCLUSIVAMENTE um objeto JSON válido com a seguinte estrutura:
{
  "slides": [
    {
      "layout": "cover" | "content" | "closing",
      "title": "Título curto e impactante (máx 80 caracteres)",
      "body": "Texto de apoio objetivo (máx 280 caracteres)"
    }
  ],
  "caption": "Texto completo da legenda do Instagram com emojis, quebras de linha e 5 a 8 hashtags no final"
}

2. QUANTIDADE EXATA: O array "slides" DEVE conter EXATAMENTE ${brief.slideCount} slides.
3. ESTRUTURA DOS SLIDES:
   - Slide 1: layout "cover" (Capa com gancho magnético, foco em parar a rolagem no feed).
   - Slides intermediários (do 2 ao ${brief.slideCount - 1}): layout "content" (Conteúdo de alto valor, passos práticos, sem rodeios).
   - Último slide (${brief.slideCount}): layout "closing" (Conclusão + CTA claro voltado ao objetivo: ${brief.objective}).
4. TOM DE VOZ: "${brief.tone}".
5. IDIOMA: Português do Brasil (pt-BR).
`.trim();

  const userPrompt = `
Crie um carrossel para o Instagram da KNDev's Solutions sobre o seguinte briefing:
- Tema: "${brief.topic}"
- Número total de slides: ${brief.slideCount}
- Tom: ${brief.tone}
- Objetivo: ${brief.objective}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    if (Array.isArray(parsed.slides) && parsed.slides.length === brief.slideCount) {
      return {
        slides: parsed.slides,
        caption:
          parsed.caption ||
          `${brief.topic} 🚀\n\nConfira os passos essenciais neste carrossel.\n\n#KNDevs #Tecnologia #Software #Inovacao`,
      };
    }
  } catch (error) {
    console.error('[AI Generator] Erro na chamada do OpenAI GPT:', error);
  }

  return generateFallbackContent(brief);
}

export async function regenerateSingleSlideContent(
  brief: GeneratePostRequest,
  slideIndex: number,
  totalSlides: number,
  existingSlide: Slide,
): Promise<Omit<Slide, 'id'>> {
  if (!config.openaiApiKey) {
    return {
      layout: existingSlide.layout,
      title: `${existingSlide.title} (Revisado)`,
      body: `Nova abordagem prática com foco em ${brief.objective}: implemente automação estratégica para acelerar seus resultados.`,
    };
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const isCover = slideIndex === 0;
  const isClosing = slideIndex === totalSlides - 1;
  const layout = isCover ? 'cover' : isClosing ? 'closing' : 'content';

  const prompt = `
Você está revisando um carrossel para a KNDev's Solutions sobre o tema: "${brief.topic}".
Regenere com novas palavras e ideias mais fortes o slide número ${slideIndex + 1} de ${totalSlides} (layout: "${layout}").
Tom: ${brief.tone}. Objetivo: ${brief.objective}.
Versão anterior do slide:
- Título: "${existingSlide.title}"
- Corpo: "${existingSlide.body}"

Retorne um JSON no formato:
{
  "title": "novo título curto",
  "body": "novo corpo explicativo"
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      layout,
      title: parsed.title || existingSlide.title,
      body: parsed.body || existingSlide.body,
    };
  } catch (err) {
    console.error('[AI Generator] Falha ao regenerar slide via GPT:', err);
    return {
      layout: existingSlide.layout,
      title: `${existingSlide.title} (Atualizado)`,
      body: existingSlide.body,
    };
  }
}

function generateFallbackContent(brief: GeneratePostRequest): {
  slides: Omit<Slide, 'id'>[];
  caption: string;
} {
  const count = brief.slideCount;
  const slides: Omit<Slide, 'id'>[] = [];

  // Slide 1: Cover
  slides.push({
    layout: 'cover',
    title: brief.topic,
    body: "Como simplificar processos e acelerar sua operação com tecnologia prática da KNDev's.",
  });

  // Intermediate slides
  const tips = [
    {
      title: '1. Mapeie o processo repetitivo',
      body: 'Antes de automatizar, entenda onde a equipe perde tempo em tarefas manuais e burocráticas.',
    },
    {
      title: '2. Defina os gatilhos e integrações',
      body: 'Conecte formulários, CRMs e APIs para os dados fluírem sem necessidade de intervenção manual.',
    },
    {
      title: '3. Valide a consistência',
      body: 'Monitore as primeiras execuções e crie alertas para qualquer anomalia no fluxo de trabalho.',
    },
    {
      title: '4. Reduza atritos e retrabalho',
      body: 'Elimine etapas desnecessárias e foque no tempo de resposta para clientes e parceiros.',
    },
    {
      title: '5. Meça o ganho de tempo',
      body: 'Acompanhe as horas economizadas mensalmente e direcione seu time para decisões estratégicas.',
    },
    {
      title: '6. Escale com segurança',
      body: 'Adicione novas automações gradualmente, mantendo logs e rastreabilidade constantes.',
    },
    {
      title: '7. Adote soluções sob medida',
      body: 'Ferramentas personalizadas resolvem a dor exata do negócio sem complexidade excessiva.',
    },
    {
      title: '8. Transforme dados em ação',
      body: 'Use dashboards integrados para saber exatamente quais canais geram mais retorno.',
    },
  ];

  for (let i = 1; i < count - 1; i++) {
    const tip = tips[(i - 1) % tips.length];
    slides.push({
      layout: 'content',
      title: tip.title,
      body: tip.body,
    });
  }

  // Last slide: Closing
  slides.push({
    layout: 'closing',
    title: 'Pronto para dar o próximo passo?',
    body: "Fale com a equipe da KNDev's Solutions e descubra como levar mais inteligência e automação para o seu negócio.",
  });

  const caption = `${brief.topic} 🚀\n\nNo cenário atual, automação e clareza de processos são fundamentais para empresas que querem escalar com solidez e eficiência.\n\nDeslize o carrossel para conferir os principais passos e salve para consultar na sua próxima sprint!\n\n#KNDevs #KNDevsSolutions #Tecnologia #Automacao #SoftwareEngineering #Inovacao #SocialStudio`;

  return { slides, caption };
}
