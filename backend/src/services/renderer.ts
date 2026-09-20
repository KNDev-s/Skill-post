import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { config } from '../config.js';
import type { Slide } from '../types.js';

let logoDataUri = '';

async function getLogoDataUri(): Promise<string> {
  if (logoDataUri) return logoDataUri;
  try {
    const logoPath = path.join(config.skillDir, 'assets/logo-white.png');
    const buffer = await fs.readFile(logoPath);
    logoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    logoDataUri = '';
  }
  return logoDataUri;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxCharsPerLine = 32): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function generateSlideSvg(
  slide: Slide,
  index: number,
  total: number,
  logoUri: string,
): string {
  const isCover = slide.layout === 'cover';
  const isClosing = slide.layout === 'closing';

  const titleLines = wrapText(slide.title, isCover ? 24 : 28);
  const bodyLines = wrapText(slide.body, isCover ? 36 : 40);

  const titleLineHeight = isCover ? 74 : 64;
  const titleStartY = isCover ? 470 : 420;

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="100" y="${titleStartY + i * titleLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  const bodyStartY = titleStartY + titleLines.length * titleLineHeight + 50;
  const bodyLineHeight = 44;

  const bodyTspans = bodyLines
    .map(
      (line, i) =>
        `<tspan x="100" y="${bodyStartY + i * bodyLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  const slideNumberFormatted = String(index + 1).padStart(2, '0');
  const totalFormatted = String(total).padStart(2, '0');

  // Cores oficiais da BRAND.md da KNDev's Solutions:
  // - Azul-noturno: #071426 (Fundo)
  // - Azul de superfície: #0E1A32
  // - Azul principal: #1739DA
  // - Azul elétrico: #134AFB
  // - Coral: #F9543B (Destaque oficial)
  // - Branco: #FEFEFE
  // - Branco azulado: #F3F6FF
  return `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgNight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071426" />
      <stop offset="50%" stop-color="#0E1A32" />
      <stop offset="100%" stop-color="#050E1B" />
    </linearGradient>
    <radialGradient id="electricBlueGlow" cx="90%" cy="10%" r="60%">
      <stop offset="0%" stop-color="#134AFB" stop-opacity="0.30" />
      <stop offset="100%" stop-color="#134AFB" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="coralGlow" cx="15%" cy="90%" r="50%">
      <stop offset="0%" stop-color="#F9543B" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#F9543B" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background Base (Azul-noturno oficial) -->
  <rect width="1080" height="1350" fill="url(#bgNight)" />
  <rect width="1080" height="1350" fill="url(#electricBlueGlow)" />
  <rect width="1080" height="1350" fill="url(#coralGlow)" />

  <!-- Grid tecnológico sutil -->
  <line x1="100" y1="180" x2="980" y2="180" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
  <line x1="100" y1="1200" x2="980" y2="1200" stroke="rgba(255,255,255,0.06)" stroke-width="1" />

  <!-- Header Section -->
  <g transform="translate(100, 95)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="220" height="55" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="38" fill="#FEFEFE" font-family="Space Grotesk, sans-serif" font-size="24" font-weight="700">KNDev's <tspan fill="#F9543B">Solutions</tspan></text>`
    }

    <!-- Slide Indicator Pill -->
    <rect x="740" y="5" width="140" height="44" rx="22" fill="#0E1A32" stroke="rgba(243, 246, 255, 0.15)" stroke-width="1.5" />
    <text x="810" y="34" fill="#F3F6FF" font-family="monospace, sans-serif" font-size="20" font-weight="700" text-anchor="middle">
      <tspan fill="#F9543B">${slideNumberFormatted}</tspan> / ${totalFormatted}
    </text>
  </g>

  <!-- Layout Tag / Destaque em Coral (#F9543B) ou Azul Elétrico (#134AFB) -->
  <g transform="translate(100, 270)">
    <rect width="${isCover ? '250' : isClosing ? '230' : '200'}" height="42" rx="8" fill="${isCover ? '#F9543B' : 'rgba(19, 74, 251, 0.2)'}" stroke="${isCover ? '#F9543B' : '#134AFB'}" stroke-width="1.5" />
    <text x="${isCover ? '24' : '20'}" y="28" fill="${isCover ? '#FEFEFE' : '#F3F6FF'}" font-family="Space Grotesk, sans-serif" font-size="16" font-weight="700" letter-spacing="1">
      ${isCover ? 'KNDEVS INSIGHT' : isClosing ? 'PRÓXIMO PASSO' : 'DIRETRIZ'}
    </text>
  </g>

  <!-- Title (Space Grotesk / Branco #FEFEFE) -->
  <text font-family="Space Grotesk, system-ui, sans-serif" font-size="${isCover ? '60' : '52'}" font-weight="700" fill="#FEFEFE" letter-spacing="-0.5">
    ${titleTspans}
  </text>

  <!-- Body (Inter / Branco azulado #F3F6FF) -->
  <text font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="400" fill="#A0AEC0" line-height="1.5">
    ${bodyTspans}
  </text>

  <!-- Footer Section com Assinatura Oficial KNDev's Solutions -->
  <g transform="translate(100, 1220)">
    <text x="0" y="45" fill="#64748B" font-family="Space Grotesk, sans-serif" font-size="20" font-weight="600">kndevs.com.br</text>
    <text x="880" y="45" fill="${isClosing ? '#F9543B' : '#134AFB'}" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="700" text-anchor="end">
      ${isClosing ? "Fale com a KNDev's ➔" : 'Arraste para o lado ➔'}
    </text>
  </g>
</svg>`;
}

export async function renderSlideImage(
  postId: string,
  slide: Slide,
  index: number,
  total: number,
): Promise<string> {
  const postFolder = path.join(config.slidesDir, postId);
  await fs.mkdir(postFolder, { recursive: true });

  const logoUri = await getLogoDataUri();
  const svgContent = generateSlideSvg(slide, index, total, logoUri);
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: 'width',
      value: 1080,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  const fileName = `${slide.id}.png`;
  const filePath = path.join(postFolder, fileName);
  await fs.writeFile(filePath, pngBuffer);

  return `${config.baseUrl}/public/slides/${postId}/${fileName}`;
}

export async function renderAllSlides(postId: string, slides: Slide[]): Promise<Slide[]> {
  const updatedSlides: Slide[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    try {
      const imageUrl = await renderSlideImage(postId, slide, i, slides.length);
      updatedSlides.push({ ...slide, imageUrl });
    } catch (err) {
      console.error(`Erro ao renderizar slide ${slide.id}:`, err);
      updatedSlides.push(slide);
    }
  }
  return updatedSlides;
}
