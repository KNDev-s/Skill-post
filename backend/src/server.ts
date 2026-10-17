import fs from 'node:fs/promises';
import path from 'node:path';
import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { postRoutes } from './routes/posts.js';

export const app = Fastify({
  logger: process.env.NODE_ENV !== 'test',
});

// Registrar plugins e rotas imediatamente
await app.register(fastifyCors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Idempotency-Key'],
});

try {
  await fs.mkdir(config.slidesDir, { recursive: true });
} catch {
  // Directory might already exist
}

app.get('/health', async () => ({
  status: 'ok',
  service: 'kndevs-social-backend',
  timestamp: new Date().toISOString(),
}));

app.get('/public/slides/:postId/:file', async (request, reply) => {
  const { postId, file } = request.params as { postId: string; file: string };
  const sanitizedPostId = path.basename(postId);
  const sanitizedFile = path.basename(file);
  const filePath = path.join(config.slidesDir, sanitizedPostId, sanitizedFile);
  try {
    const buffer = await fs.readFile(filePath);
    reply.header('Content-Type', 'image/png');
    return reply.send(buffer);
  } catch {
    return reply.status(404).send({ error: 'Image not found' });
  }
});

await app.register(postRoutes, { prefix: '/api/v1' });
await app.ready();

// Em ambientes não-teste, escutar na porta provida pela Vercel/Node
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || config.port || 3001);
  try {
    const address = await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`🚀 Servidor KNDev's Social Backend rodando em ${address}`);
  } catch (err) {
    app.log.warn(`Aviso de inicialização de porta: ${err}`);
  }
}

// Handler para ambientes serverless
const handler = async (req: any, res: any) => {
  try {
    await app.ready();
    app.server.emit('request', req, res);
  } catch (err) {
    console.error('Error in serverless handler:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal Server Error', message: String(err) }));
    }
  }
};

export default Object.assign(handler, app);
