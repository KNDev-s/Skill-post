import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const instagramApiHost = process.env.INSTAGRAM_API_HOST || 'graph.facebook.com';
if (!['graph.facebook.com', 'graph.instagram.com'].includes(instagramApiHost)) {
  throw new Error('INSTAGRAM_API_HOST deve ser graph.facebook.com ou graph.instagram.com.');
}

export const config = {
  port: Number(process.env.PORT || 3001),
  baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3001',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  instagramApiHost,
  publicDir: path.resolve(__dirname, '../public'),
  slidesDir: path.resolve(__dirname, '../public/slides'),
  skillDir: path.resolve(__dirname, '../../skill'),
};
