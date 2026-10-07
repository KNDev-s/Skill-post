# KNDev's · Social Studio

Estúdio interno para gerar carrosséis, revisar, aprovar e solicitar publicação no Instagram. A interface usa React, TypeScript e Vite; o backend suportado agora é um Cloudflare Worker com D1, R2 e Browser Run. A identidade visual vem de `skill/BRAND.md` e dos logos originais em `skill/assets/`.

## Estado atual

- Implementação local preparada e testada. O deploy e a validação na conta Cloudflare ainda precisam ser realizados.
- Publicação real começa **desabilitada**. Leia o procedimento em `docs/cloudflare.md` antes de ativá-la.
- O servidor Fastify em `backend/` foi desativado; seu código permanece como referência para o Matheus. Ele não deve ser hospedado como servidor de produção.
- Uma conta Instagram da KNDev's, vários usuários internos autenticados pelo Cloudflare Access. Cada usuário acessa seus próprios posts.
- Geração/publicação usam trabalhos persistentes no D1. Um Cron por minuto inicia um trabalho, priorizando publicação. A aba pode ser fechada; horários são aproximados, sujeitos a fila e disponibilidade dos provedores.
- Não há renovação automática do token, cancelamento de agendamento pela interface, gestão de múltiplas contas ou galeria de histórico. O GET de listagem já existe; o último post é recuperado na mesma sessão do navegador.

## Desenvolvimento

Use Node.js 24 LTS e npm. Na raiz do projeto:

```sh
npm ci
npm run dev
```

O endereço local usa demonstração, sem chamadas pagas e sem publicação. O modo fica visível na tela. A cópia local de `.env` do backend não configura automaticamente o Worker.

```sh
node scripts/prepare-local-secrets.mjs
```

Esse comando cria `.dev.vars` a partir dos campos existentes em `backend/.env`, gera uma chave de assinatura de mídia e nunca imprime valores. Se o arquivo já existir, preserva-o. Ambos estão ignorados pelo Git. Tudo com prefixo `VITE_` é público e jamais deve conter segredos.

```sh
npm run check
npm --prefix backend ci --ignore-scripts
npm --prefix backend test
npx playwright install chromium
npm run test:e2e
npm run deploy:check
node scripts/audit-secrets.mjs
npm audit --audit-level=moderate
```

`deploy:check` monta o pacote e executa um dry run; não publica. `build:deploy` força o adapter real e a API `/api/v1`, evitando enviar uma demonstração por engano.

O Worker não possui um atalho que remova autenticação para desenvolvimento. Os testes de integração usam D1/R2 locais e provedores simulados. Para validar serviços reais, configure um ambiente de homologação protegido, com banco/bucket/conta de teste separados. `dev:backend` inicia o emulador para diagnóstico; com os placeholders e HTTP local, o acesso às rotas é recusado por projeto.

## Arquitetura

```text
Navegador → Cloudflare Access → Worker → D1 (posts, comandos e trabalhos)
                                   → Assets (interface, fontes, logos)
Cron → Worker → OpenAI → Browser Run → R2 privado (PNG + JPEG)
Cron → Worker → Instagram Graph API → publicação
Meta → /media/... assinado e temporário → Worker → R2
```

- `src/services/api/`: chamadas HTTP existentes, revisão e chave de idempotência.
- `src/types/post.ts`: contrato Zod compartilhado pelo frontend e Worker.
- `worker/security.ts`: JWT do Access, origem, limites de corpo e URLs assinadas.
- `worker/api.ts`: autorização por proprietário e transições de estado.
- `worker/store.ts` + `migrations/0001_posts.sql`: persistência, idempotência e concorrência atômicas.
- `worker/jobs.ts`: execução persistente pelo Cron, bloqueio antes de publicar e recuperação de interrupções.
- `worker/ai.ts`, `worker/render.ts`, `worker/meta.ts`: adaptadores de provedores.
- `docs/api.md`: contrato e limites do Worker.
- `docs/cloudflare.md`: configuração, deploy, homologação e operação.
- `docs/audit.md`: achados, correções, evidências e limitações.

As fontes são servidas localmente. O navegador não recebe tokens da Meta/OpenAI nem a chave de assinatura; as chamadas aos provedores partem do Worker. Falhas nunca acionam geração ou publicação simuladas no modo integrado.
