# Cloudflare Pages + Worker/API

## Frontend no Pages

1. Em Workers & Pages, criar um projeto **Pages** conectado ao repositório `KNDev-s/Skill-post`.
2. Usar a raiz do repositório; comando de build `npm run build`; saída `dist`; Node 22 LTS (`NODE_VERSION=22` ou versão LTS exata da equipe).
3. Escolher conscientemente a branch de produção. O trabalho inicial está em `feature/social-creator-v1`; não foi criada nem alterada `main`. Quando a equipe tiver a branch principal, selecioná-la no Pages; feature branches podem gerar previews.
4. Em um preview de interface, definir `VITE_SERVICE_MODE=mock`. A faixa de demonstração permanece visível. Não há conexão real com Instagram.
5. Na integração real, definir `VITE_SERVICE_MODE=api`, `VITE_API_BASE_URL=https://api.seu-dominio.com/api/v1` e credenciais conforme o backend. Fazer novo build após alterar variáveis.

`wrangler.toml` já informa `pages_build_output_dir = "./dist"`. A aplicação não precisa de servidor Node em produção. O Pages oferece fallback da SPA quando não há `404.html` na raiz. Não adicionamos redirect global `/*` que possa confundir as futuras rotas da API.

Também é possível usar Wrangler, após instalar uma versão compatível com seu Node e autenticar:

```sh
npm run build
npx wrangler pages dev dist
npx wrangler pages deploy dist --project-name kndevs-social-creator
```

O projeto Pages deve existir na conta correta. Estes comandos são instruções; a entrega não publica nem cria recursos/billing automaticamente.

## Backend separado (recomendado para a integração)

- Worker com seu próprio repositório ou pasta/projeto e configuração Wrangler independente. `backend/` contém somente orientação, não um segundo deploy incompleto.
- Expor o contrato de `docs/api.md` na URL configurada.
- Guardar credenciais de IA/Meta como secrets do Worker. Tokens nunca entram em `VITE_*`, `public/`, `dist/` ou no Git.
- Persistir posts/revisões/aprovações e jobs. R2 pode receber mídia renderizada; banco/filas/agendador são escolhas do backend.
- Para origem distinta, aplicar CORS e cookies segundo o contrato. Para mesma origem, rotear `/api/*` a um Worker ou implementar Pages Functions, preservando o prefixo `/api/v1`.
- Apenas configurar `VITE_API_BASE_URL=/api/v1` **não cria um proxy**. Sem Worker/Function/roteamento, o Pages pode devolver o HTML da SPA; o client o rejeita como resposta inválida.
- Uma futura migração do frontend para Workers Static Assets pode servir o mesmo `dist/`, com configuração separada de `assets.directory`; o `wrangler.toml` atual é especificamente de **Pages**.

## Uso interno

Configurar proteção da equipe (por exemplo Cloudflare Access) tanto para o domínio do frontend quanto para a API e previews com dados reais. O frontend não implementa login nesta V1. O backend deve verificar identidade e autorização em toda operação; esconder a tela não protege endpoints. URLs de mídia precisam ser acessíveis ao consumidor correto quando a publicação for integrada.

## Conferência após deploy

Abrir a página e recarregar; conferir variáveis/modo visível; testar criação, polling, erro de API, aprovação e agendamento no ambiente de testes. Validar que somente o backend realiza publicação e que um timeout não produz duplicatas. Não usar credenciais ou conta real de publicação em testes automatizados desta interface.

Referências oficiais: [Pages + Vite](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [configuração Wrangler de Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [fallback de SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/).
