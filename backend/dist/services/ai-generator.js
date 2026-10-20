import OpenAI from 'openai';
import { config } from '../config.js';
function buildEditorialSystemPrompt(brief) {
    return `
Você é o estrategista editorial e redator sênior da KNDev's Solutions, empresa de tecnologia especializada em software sob medida, automação inteligente e soluções digitais de alto impacto.

SEU OBJETIVO:
Criar o conteúdo textual completo de um carrossel de alto impacto para o Instagram da KNDev's sobre o tema solicitado, com profundo rigor técnico, originalidade e utilidade prática imediata.

DIRETRIZES EDITORIAIS OBRIGATÓRIAS:
1. FOCO TOTAL NO TEMA: Desenvolva ideias, etapas ou princípios diretamente aplicáveis ao tema "${brief.topic}". Nunca desvie para tópicos genéricos ou desconexos.
2. NARRATIVA E PROGRESSÃO LÓGICA:
   - Slide 1 (layout "cover"): Gancho magnético, pergunta provocativa ou afirmação forte que interrompa a rolagem no feed.
   - Slides intermediários (layout "content"): Cada slide DEVE apresentar um insight ou etapa diferente, concreto, com explicação clara e aplicável. Não faça slides intercambiáveis nem encha linguiça.
   - Último slide (layout "closing"): Conclusão sólida + CTA natural alinhado ao objetivo "${brief.objective}".
3. PROIBIDO CLICHÊS DE MARKETING:
   - NUNCA use frases batidas como: "No mundo acelerado de hoje", "Revolucione seu negócio", "Leve sua empresa ao próximo nível", "Desbloqueie seu potencial", "A chave do sucesso".
   - Evite promessas mágicas, dados estatísticos inventados ou depoimentos fictícios.
4. TOM DE VOZ: ${brief.tone} (profissional, direto, transparente, acessível e sem jargões corporativos vazios).
5. IDIOMA: Português do Brasil (pt-BR).

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
Retorne EXCLUSIVAMENTE um objeto JSON válido com a seguinte estrutura:
{
  "slides": [
    {
      "layout": "cover" | "content" | "closing",
      "title": "Título claro e conciso (máximo 80 caracteres)",
      "body": "Texto explicativo com substância prática (máximo 260 caracteres)"
    }
  ],
  "caption": "Legenda completa do post no Instagram, aprofundando o tema com quebras de linha, emojis pontuais e 5 a 7 hashtags estratégicas no final."
}
O array "slides" DEVE conter EXATAMENTE ${brief.slideCount} slides.
`.trim();
}
async function callGemini(systemPrompt, userPrompt, apiKey) {
    const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
    let lastError = null;
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.35,
                    },
                }),
            });
            const data = (await res.json());
            if (!res.ok) {
                throw new Error(data.error?.message || `Erro HTTP ${res.status}`);
            }
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) {
                throw new Error('Resposta vazia da API do Gemini.');
            }
            return JSON.parse(rawText);
        }
        catch (err) {
            lastError = err;
            console.warn(`[AI Generator] Falha com Gemini modelo ${model}: ${err.message}. Tentando próximo...`);
        }
    }
    throw lastError || new Error('Falha ao gerar conteúdo com Google Gemini.');
}
async function callOpenAI(systemPrompt, userPrompt, apiKey) {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
    });
    const rawContent = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(rawContent);
}
export async function generateCarouselContent(brief) {
    const systemPrompt = buildEditorialSystemPrompt(brief);
    const userPrompt = `
Crie um carrossel para o Instagram da KNDev's Solutions sobre o seguinte briefing:
- Tema: "${brief.topic}"
- Número total de slides: ${brief.slideCount}
- Tom: ${brief.tone}
- Objetivo: ${brief.objective}
`.trim();
    // 1. Tenta gerar via Google Gemini se a chave estiver configurada
    if (config.geminiApiKey) {
        try {
            console.log('[AI Generator] Gerando carrossel com Google Gemini (gemini-3.8-flash)...');
            const parsed = await callGemini(systemPrompt, userPrompt, config.geminiApiKey);
            if (Array.isArray(parsed.slides) && parsed.slides.length === brief.slideCount) {
                console.log('[AI Generator] Carrossel gerado com sucesso via Gemini!');
                return {
                    slides: parsed.slides,
                    caption: parsed.caption || `${brief.topic} 🚀\n\nConfira os passos essenciais neste carrossel.`,
                };
            }
        }
        catch (err) {
            console.error('[AI Generator] Erro na geração com Gemini:', err);
        }
    }
    // 2. Tenta gerar via OpenAI GPT-4o se a chave estiver configurada
    if (config.openaiApiKey) {
        try {
            console.log('[AI Generator] Gerando carrossel com OpenAI GPT-4o...');
            const parsed = await callOpenAI(systemPrompt, userPrompt, config.openaiApiKey);
            if (Array.isArray(parsed.slides) && parsed.slides.length === brief.slideCount) {
                console.log('[AI Generator] Carrossel gerado com sucesso via OpenAI!');
                return {
                    slides: parsed.slides,
                    caption: parsed.caption || `${brief.topic} 🚀\n\nConfira os passos essenciais neste carrossel.`,
                };
            }
        }
        catch (err) {
            console.error('[AI Generator] Erro na geração com OpenAI:', err);
        }
    }
    // 3. Fallback determinístico caso nenhuma chave esteja configurada ou ambas falhem
    console.warn('[AI Generator] Nenhuma API de IA respondeu com sucesso. Utilizando gerador de fallback estruturado.');
    return generateFallbackContent(brief);
}
export async function regenerateSingleSlideContent(brief, slideIndex, totalSlides, existingSlide) {
    const isCover = slideIndex === 0;
    const isClosing = slideIndex === totalSlides - 1;
    const layout = isCover ? 'cover' : isClosing ? 'closing' : 'content';
    const systemPrompt = `
Você é o redator sênior da KNDev's Solutions.
Reescreva com profundidade e precisão técnica o slide número ${slideIndex + 1} de ${totalSlides} (layout: "${layout}") para um carrossel sobre "${brief.topic}".
Tom: ${brief.tone}. Objetivo: ${brief.objective}.
Versão anterior do slide:
- Título: "${existingSlide.title}"
- Corpo: "${existingSlide.body}"

Retorne EXCLUSIVAMENTE um JSON com:
{
  "title": "novo título impactante e objetivo (máx 80 caracteres)",
  "body": "novo corpo explicativo com substância prática (máx 260 caracteres)"
}
`.trim();
    const userPrompt = `Reescreva o slide ${slideIndex + 1} sobre "${brief.topic}" de forma mais forte e sem clichês.`;
    if (config.geminiApiKey) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${config.geminiApiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.35,
                    },
                }),
            });
            const data = (await res.json());
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
                const parsed = JSON.parse(rawText);
                return {
                    layout,
                    title: parsed.title || existingSlide.title,
                    body: parsed.body || existingSlide.body,
                };
            }
        }
        catch (err) {
            console.error('[AI Generator] Falha ao regenerar slide com Gemini:', err);
        }
    }
    if (config.openaiApiKey) {
        try {
            const openai = new OpenAI({ apiKey: config.openaiApiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0.35,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            });
            const raw = completion.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw);
            return {
                layout,
                title: parsed.title || existingSlide.title,
                body: parsed.body || existingSlide.body,
            };
        }
        catch (err) {
            console.error('[AI Generator] Falha ao regenerar slide com OpenAI:', err);
        }
    }
    return {
        layout: existingSlide.layout,
        title: `${existingSlide.title} (Revisado)`,
        body: `Nova abordagem prática com foco em ${brief.objective} aplicada ao tema ${brief.topic}.`,
    };
}
function generateFallbackContent(brief) {
    const count = brief.slideCount;
    const slides = [];
    slides.push({
        layout: 'cover',
        title: brief.topic,
        body: `Diretrizes práticas e estratégias essenciais sobre ${brief.topic} pela KNDev's Solutions.`,
    });
    const genericInsights = [
        {
            title: '1. Diagnóstico do cenário',
            body: `Avalie os gargalos atuais e identifique exatamente onde aplicar melhorias em ${brief.topic}.`,
        },
        {
            title: '2. Definição de prioridades',
            body: 'Foque primeiro nas ações de menor atrito e maior impacto para o seu negócio.',
        },
        {
            title: '3. Execução consistente',
            body: 'Mantenha processos bem documentados para garantir que cada etapa seja reproduzível.',
        },
        {
            title: '4. Monitoramento e métricas',
            body: 'Acompanhe indicadores claros para medir o retorno das decisões tomadas.',
        },
        {
            title: '5. Otimização contínua',
            body: 'Faça ajustes graduais com base em dados reais coletados na operação.',
        },
        {
            title: '6. Escala com segurança',
            body: 'Estruture a expansão da operação mantendo a qualidade e estabilidade dos processos.',
        },
    ];
    for (let i = 1; i < count - 1; i++) {
        const item = genericInsights[(i - 1) % genericInsights.length];
        slides.push({
            layout: 'content',
            title: item.title,
            body: item.body,
        });
    }
    slides.push({
        layout: 'closing',
        title: 'Pronto para o próximo passo?',
        body: `Converse com o time da KNDev's Solutions e aplique as melhores práticas de ${brief.topic} no seu negócio.`,
    });
    const caption = `${brief.topic} 🚀\n\nAcompanhe as principais recomendações estratégicas para potencializar seus resultados.\n\nSalve este post para consultar depois!\n\n#KNDevs #KNDevsSolutions #Tecnologia #Software #Inovacao`;
    return { slides, caption };
}
