# KNDev's · Social Studio

Interface interna V1 para transformar um briefing em carrossel, revisar slides e legenda, aprovar e solicitar publicação/agendamento. React + TypeScript + Vite. Frontend estático para Cloudflare Pages; backend independente para o Matheus integrar.

## Estado da entrega

- O repositório estava vazio na inspeção inicial em 18/09/2026.
- A skill original e os assets KNDev's não estavam no repositório nem nos anexos da conversa de referência. `skill/README.md` registra onde adicioná-los. Não há uma skill original reconstruída ou inventada nesta entrega.
- A identidade atual é **provisória** (wordmark em texto, lilás e fontes DM Sans/Manrope). Substituição em `src/config/brand.ts`, `src/styles.css` e `public/brand/`.
- Modo mock permite testar todo o fluxo, sem IA, publicação externa ou custos de API. Dados ficam em memória e desaparecem ao recarregar. Um agendamento mock não dispara publicação futura.
- O modo API está implementado contra o contrato em `docs/api.md`; não inclui backend, autenticação, renderer de imagens, storage ou integração Instagram.

## Executar

Requisito: Node.js 22 ou superior (use uma versão LTS atual) e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local` em vez de `cp` se preferir. Abra o endereço informado pelo Vite, normalmente `http://127.0.0.1:5173`.

Use **Usar exemplo → Gerar conteúdo**. Selecione miniaturas, regenere um slide, edite e salve a legenda, aprove e escolha publicar agora ou agendar. Alterações invalidam a aprovação. Um novo briefing só é aplicado ao clicar em Gerar, criando outro post; regenerar usa o briefing do post atual.

```sh
npm run check          # tipos, testes de contratos/estados, build
npx playwright install chromium
npm run test:e2e       # fluxo completo em desktop e celular
npm run format:check
npm run build         # saída em dist/
npm run preview       # confere o build, sem publicar
```

## Variáveis

| Variável                | Padrão                        | Uso                                                                      |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `VITE_SERVICE_MODE`     | `mock` no dev; `api` no build | `mock` para demonstração explícita, `api` para o backend                 |
| `VITE_API_BASE_URL`     | `/api/v1`                     | URL do Worker/API incluindo versão, ex. `https://api.exemplo.com/api/v1` |
| `VITE_API_TIMEOUT_MS`   | `30000`                       | Tempo máximo de uma requisição                                           |
| `VITE_POLL_INTERVAL_MS` | `2000`                        | Consulta de geração/publicação; agendados usam no mínimo 15 segundos     |
| `VITE_API_CREDENTIALS`  | `same-origin`                 | `include` apenas se a integração usar cookies entre origens              |

As variáveis são incorporadas **durante o build**. Alterou configuração? Reinicie o dev server ou refaça o deploy. Tudo com `VITE_` é público; chaves de IA, Meta e Cloudflare pertencem aos secrets do backend. O `.env.example` define mock explicitamente: se copiá-lo para um ambiente de build, esse build também será demonstração.

Falhas da API **não acionam fallback mock**. Isso evita apresentar uma publicação fictícia como real. A escolha do adapter acontece em `src/services/index.ts`.

## Organização

```text
src/
  components/        # Marca, preview e etapas
  config/            # Ambiente e identidade visual
  hooks/usePost.ts   # Operações, erros e polling sequencial
  pages/             # Interface do estúdio
  services/
    post-service.ts  # Interface independente de transporte
    api/             # Cliente HTTP + adapter de endpoints
    mocks/           # Simulador local com mesmas regras de estados
  types/post.ts      # DTOs e schemas Zod para respostas em runtime
public/brand/        # Lugar para assets oficiais públicos
skill/               # Lugar reservado para a skill original; fora do bundle
backend/README.md    # Handoff para o Matheus
docs/                # Contrato da API e deploy
tests/               # Cenários de navegador
wrangler.toml        # Configuração Cloudflare Pages
```

## Integração do Matheus

1. Implementar os endpoints de `docs/api.md`, retornando `{ data: Post }` ou `{ error: { code, message } }`.
2. Preservar `id` e incrementar `revision` a cada alteração. Validar transições e revisão no servidor; não confiar nos botões desabilitados.
3. Executar skill, IA, renderer e publicação no backend. A tela apenas recebe texto/URLs e envia comandos.
4. Processar tarefas longas de forma assíncrona; devolver `202` com o post `generating`/`publishing`. A tela consulta `GET /posts/:id` até concluir. Expor falhas como `failed` com mensagem legível.
5. Para publicação/agendamento, aplicar idempotência, autenticação/autorização, validação, CORS e armazenamento durável. Ver `backend/README.md`.
6. Configurar `VITE_SERVICE_MODE=api` e `VITE_API_BASE_URL`; testar sem mudar componentes.

O preview HTML usa a proporção 4:5 e textos do DTO, mas não exporta PNGs. Quando `imageUrl` estiver presente, mostra a imagem entregue pelo backend. O renderer oficial deve garantir tipografia, margens e que o texto completo caiba na arte.

## Validação da V1

Testes cobrem transições, revisão e idempotência no contrato, legenda alterada após aprovação, data no passado, regeneração de um slide, timeout, erros e respostas inválidas. Os cenários de navegador cobrem desktop/celular e o adapter HTTP com respostas interceptadas (incluindo geração/publicação assíncronas e recuperação de polling). Esses testes não certificam um backend real nem publicam conteúdo.

## Cloudflare

Configuração pronta para **Pages**: build `npm run build`, diretório `dist`, raiz do repositório. `wrangler.toml` declara a saída; nenhum deploy foi executado automaticamente. Veja `docs/cloudflare.md` para Pages, Worker separado, cookies, CORS e proteção do acesso interno.

Referências oficiais: [Vite: variáveis públicas e build](https://vite.dev/guide/env-and-mode), [Pages: build e deploy do Vite](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [Pages: configuração Wrangler](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
