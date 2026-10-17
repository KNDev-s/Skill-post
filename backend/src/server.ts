import fs from 'node:fs/promises';
import path from 'node:path';
import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { postRoutes } from './routes/posts.js';

export const app = Fastify({
  logger: process.env.NODE_ENV !== 'test',
});

// Registrar plugins e rotas imediatamente (síncrono no Fastify)
app.register(fastifyCors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Idempotency-Key'],
});

app.get('/health', async () => ({
  status: 'ok',
  service: 'kndevs-social-backend',
  timestamp: new Date().toISOString(),
}));

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'kndevs-social-backend',
  timestamp: new Date().toISOString(),
}));

const slideHandler = async (request: any, reply: any) => {
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
};

app.get('/public/slides/:postId/:file', slideHandler);
app.get('/slides/:postId/:file', slideHandler);

app.register(postRoutes, { prefix: '/api/v1' });
app.register(postRoutes, { prefix: '/v1' });

try {
  fs.mkdir(config.slidesDir, { recursive: true }).catch(() => {});
} catch {
  // Ignora se falhar
}

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);

const port = Number(process.env.PORT || config.port || 3001);
if (!isServerless && process.env.NODE_ENV !== 'test') {
  app.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      app.log.error(err);
    } else {
      app.log.info(`🚀 Servidor KNDev's Social Backend rodando em ${address}`);
    }
  });
}

// Handler para ambientes serverless (Vercel Functions)
const handler = (req: any, res: any): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    if (res.writableEnded || res.finished) {
      resolve();
      return;
    }
    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', reject);

    (async () => {
      try {
        await app.ready();
        app.server.emit('request', req, res);
      } catch (err: unknown) {
        console.error('Error during app.ready in serverless handler:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal Server Error', message: String(err) }));
        }
        resolve();
      }
    })();
  });
};

const serverHandler = Object.assign(handler, app);

export { handler, serverHandler };
export default serverHandler;
