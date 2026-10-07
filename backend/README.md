# Handoff para o Matheus

O backend suportado passou para `../worker/`. O servidor Node/Fastify desta pasta está desativado nos comandos `dev`, `start` e em `src/server.ts`: ele não tinha autenticação, persistência ou executor de agendamentos adequados ao deploy. Os demais módulos foram preservados como referência e seus testes de regressão continuam disponíveis.

Continue o trabalho no Worker mantendo o contrato em `../src/types/post.ts` e `../docs/api.md`:

1. API e estados: `worker/api.ts`. Retorne `{ data: Post }`, inclusive no `202`; não use `204` para essas operações.
2. Identidade: JWT assinado do Cloudflare Access; use `sub` como proprietário. Nunca aceite o proprietário enviado pelo cliente.
3. Comandos: use `commit()` e a migração D1. O trigger registra comando, revisão e trabalho na mesma transação. Não substitua por um UPDATE seguido de uma gravação independente de idempotência.
4. Execução: `worker/jobs.ts`. O Cron faz uma reivindicação atômica. Publicação incerta fica bloqueada; não repetir `media_publish` automaticamente.
5. Provedores: `worker/ai.ts`, `worker/render.ts` e `worker/meta.ts`. Não devolver mensagens brutas dos provedores, aceitar URLs arbitrárias para renderizar ou incluir tokens no DTO.
6. Arte: preservar PNG 1080 × 1350 para revisão e JPEG para publicação, com chaves imutáveis por revisão. O cliente mostra a imagem persistida.
7. Evoluções prioritárias: renovação/expiração do token, reconciliação administrativa, cancelamento de agendamento e histórico visual. Se aumentar volume, migrar a execução para Queues/Workflows mantendo os bloqueios de publicação e a transação de entrada.

Leia `../docs/cloudflare.md` para provisionamento e `../docs/audit.md` para os limites da validação. O código legado não recebe as garantias de segurança do Worker e não deve ser reativado sem uma nova revisão.
