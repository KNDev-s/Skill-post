import fs from 'node:fs/promises';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { config } from './config.js';
import { postRoutes } from './routes/posts.js';

const app = Fastify({
  logger: true,
});

async function main() {
  // Garantir diretórios públicos
  await fs.mkdir(config.slidesDir, { recursive: true });

  // 1. Configuração de CORS (permite requisições do frontend Vite)
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Permite requisições locais do Vite e ferramentas como Postman/Curl
      if (!origin || config.corsOrigin.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Idempotency-Key'],
  });

  // 2. Servir imagens estáticas geradas
  await app.register(fastifyStatic, {
    root: config.publicDir,
    prefix: '/public/',
    decorateReply: false,
  });

  // 3. Rota de Health Check
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kndevs-social-backend',
    timestamp: new Date().toISOString(),
  }));

  // 4. Registrar rotas do contrato v1
  await app.register(postRoutes, { prefix: '/api/v1' });

  // 5. Iniciar servidor
  try {
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`🚀 Servidor KNDev's Social Backend rodando em ${address}`);
    app.log.info(`📡 API Base URL: ${address}/api/v1`);
    app.log.info(`🖼️  Imagens públicas servidas em: ${address}/public/slides`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
