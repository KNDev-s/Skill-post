# Cloudflare: configuração e operação

## 1. Antes de publicar

Escolha um subdomínio sob seu controle, por exemplo `social.suaempresa.com`. Defina os e-mails autorizados da equipe. Este projeto atende uma conta Instagram; os posts são privados por usuário do Access.

Use Node.js 24 LTS. Os recursos necessários são Workers com Static Assets, D1, R2 e Browser Run. Confira disponibilidade e cobrança na sua conta antes de habilitá-los. O Cron usa processamento externo e pode exceder as cotas gratuitas; prefira homologar no plano compatível com a carga real. Nenhum recurso remoto foi criado nesta entrega.

## 2. Preparar o projeto local

```sh
npm ci
node scripts/prepare-local-secrets.mjs
npm run check
npx playwright install chromium
npm run test:e2e
npm run deploy:check
node scripts/audit-secrets.mjs
```

A demonstração roda com `npm run dev`. As integrações locais usam D1/R2 em testes, sem tokens reais. Não espere que a API em `http://localhost` funcione sem Access: o Worker exige HTTPS, domínio oficial e JWT válido. Testes reais devem usar uma implantação de homologação protegida; não desative autenticação para fazê-los passar.

`.dev.vars` guarda quatro valores somente no computador: `OPENAI_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID` e `MEDIA_SIGNING_KEY`. O último é gerado aleatoriamente. Não envie esse arquivo ao Git, chat, e-mail ou pasta pública. O script não sobrescreve arquivos existentes.

## 3. Criar os recursos Cloudflare

No terminal da raiz:

```sh
npx wrangler login
npx wrangler d1 create kndevs-social
npx wrangler r2 bucket create kndevs-social-media
```

No painel, habilite Browser Run para a conta, se necessário. Mantenha o bucket R2 privado: sem domínio público e sem acesso público `r2.dev`. Use recursos separados para homologação e produção; jamais aponte os testes para o banco de produção.

Edite `wrangler.toml`:

- Troque `database_id` pelo UUID retornado pelo D1.
- Ajuste o nome do bucket se criou outro.
- Defina `APP_ORIGIN` como a origem HTTPS exata, sem barra final.
- Configure `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` conforme a etapa seguinte.
- Mantenha `ENABLE_PUBLISHING = "false"` durante a primeira implantação.
- Mantenha `INSTAGRAM_API_HOST = "graph.instagram.com"` para o token validado nesta máquina. `graph.facebook.com` corresponde ao outro fluxo; não troque apenas porque o token foi chamado de “token da Meta”.
- `META_API_VERSION = "v21.0"` preserva a versão que respondeu à consulta real. Verifique seu prazo de suporte e homologue uma versão mais nova antes de alterá-la.

Acrescente esta configuração **no topo do arquivo, antes das tabelas**; substitua o domínio:

```toml
routes = [{ pattern = "social.suaempresa.com", custom_domain = true }]
```

`workers_dev = false`, `preview_urls = false` e `run_worker_first = true` evitam acesso alternativo e verificam autenticação também antes dos arquivos estáticos.

## 4. Configurar o login da equipe e o acesso de mídia

No Cloudflare Zero Trust → Access → Applications:

1. Crie uma aplicação Self-hosted para todo o subdomínio. Adicione política Allow somente para os e-mails da equipe; use MFA no provedor de identidade e sessão curta adequada à operação. Não crie Allow Everyone.
2. Copie o Application Audience (AUD) para `ACCESS_AUD`. Em `ACCESS_TEAM_DOMAIN`, use o domínio da equipe terminado em `.cloudflareaccess.com`, sem `https://`.
3. Crie uma aplicação mais específica para `social.suaempresa.com/media/*`, com política **Bypass** para esse caminho somente. Essa exceção permite que a Meta baixe as imagens; o Worker continua exigindo assinatura HMAC e validade máxima de uma hora.
4. Não aplique Bypass em `/`, `/api/*` ou nos demais caminhos. Não confunda uma exceção de mídia com tornar o R2 público.

O Worker verifica criptograficamente assinatura RS256, emissor, audiência, expiração e identidade. Cabeçalhos de e-mail ou JWTs forjados não bastam.

## 5. Aplicar o banco e cadastrar segredos

```sh
npx wrangler d1 migrations apply kndevs-social --remote
npm run build:deploy
npx wrangler deploy
```

Essa primeira implantação pode ficar indisponível até concluir os secrets, mas permanece protegida e sem publicação. No painel Workers & Pages → Worker → Settings → Variables and Secrets, cadastre os quatro nomes como **Secret**:

| Nome                     | De onde vem                                  |
| ------------------------ | -------------------------------------------- |
| `OPENAI_API_KEY`         | Chave da OpenAI utilizada pela equipe        |
| `INSTAGRAM_ACCESS_TOKEN` | Token local validado para a conta Instagram  |
| `INSTAGRAM_ACCOUNT_ID`   | Identificador da mesma conta; não é o App ID |
| `MEDIA_SIGNING_KEY`      | Valor aleatório já criado em `.dev.vars`     |

Também é possível usar `npx wrangler secret put NOME` e colar no prompt protegido; nunca coloque o valor na própria linha do comando. Não use variáveis `VITE_`, `[vars]` do Wrangler, GitHub público ou código para segredos. Faça novo deploy pelo painel se a interface solicitar a aplicação das alterações.

Defina limites/alertas de gasto no Cloudflare e na OpenAI. Configure o provedor para conceder à chave apenas o acesso necessário. Revise os logs: não habilite captura de corpos, cabeçalhos Authorization ou query strings da rota `/media/` em ferramentas externas.

## 6. Confirmar a Meta

```sh
node scripts/check-meta.mjs
```

O comando só lê a identidade e tenta consultar permissões; não publica. A consulta realizada confirmou que o token corresponde ao ID configurado. A listagem de permissões não pôde ser confirmada pela API; isso significa **não verificado**, e não prova ausência das permissões.

No painel da Meta, confirme para o fluxo Instagram Login:

1. Conta profissional correta e App ID correto.
2. Permissões `instagram_business_basic` e `instagram_business_content_publish` concedidas e aplicáveis à conta.
3. Em modo desenvolvimento, usuário/conta com função aceita no aplicativo e convite de teste aceito quando exigido. Para outras contas, verifique os requisitos de acesso avançado/App Review.
4. Validade do token, como obter o token de longa duração e quem fará a renovação antes do vencimento. A entrega não renova tokens automaticamente. Não presuma que “foi gerado” significa “não expira”.

Os erros “função de desenvolvedor insuficiente” e “invalid platform app” apontam para revisar permissões/funções e a combinação produto/App ID/login. O token atual já respondeu em `graph.instagram.com`; não misture com endpoints, App ID ou permissões do fluxo Facebook Login. Para usar esse outro fluxo, homologue separadamente conta profissional vinculada à Página e permissões correspondentes.

## 7. Homologar antes de liberar publicação

1. Acesse o domínio sem login: deve exigir Access. Usuário fora da política deve ser recusado. Confira que o endereço `workers.dev` e previews não fornecem acesso alternativo.
2. Entre, gere um carrossel pequeno e espere a fila. Confira se o Cron aparece no painel e os estados avançam de `generating` para `ready`.
3. Verifique imagens, acentos, logo, legenda e todos os slides. PNGs devem medir 1080 × 1350. O Browser Run real ainda precisa desse teste; os testes locais validaram o mesmo HTML no Chromium.
4. Recarregue a aba: o último post da sessão deve reaparecer. Acesse com outro usuário: o post e a imagem privada devem ser recusados.
5. Edite a legenda após aprovar: o estado deve voltar a `ready`. O envio permanece bloqueado sem nova aprovação.
6. Confirme que `/media/...` sem assinatura é recusado. Durante o teste de publicação, confira que a Meta consegue baixar o JPEG pela URL temporária, sem login no Access. Não divulgue essa URL.
7. Somente depois da confirmação da conta/permissões, defina `ENABLE_PUBLISHING = "true"` e faça novo deploy. Aprove um conteúdo de teste e clique uma vez em publicar. Confira o post na própria conta Instagram e o `published_id` no banco.
8. Agende outro teste alguns minutos à frente. Feche a aba e confirme a execução pelo Cron. O horário não é uma garantia de segundo exato: há fila, processamento da mídia e disponibilidade da Meta.

Nada foi publicado na conta Instagram durante esta entrega. Os testes automatizados de publicação usam respostas simuladas do provedor.

## 8. Operar com segurança

- Há limite global de 30 gerações por janela de 24 horas, 5 trabalhos pendentes por usuário e 20 comandos por minuto/usuário. Esses limites estão no SQL/Worker; não substituem orçamento e monitoramento.
- O Cron inicia um trabalho por minuto. Para mais volume ou garantias de recuperação automática, evolua para Queues/Workflows com os mesmos controles transacionais.
- Se um job parar, após 16 minutos ele passa a `failed`. Se `media_publish` já foi tentado, o Worker não o repete: existe risco de o provedor ter publicado mesmo após timeout.
- Em resultado incerto, consulte a conta Instagram, `posts.container_id`, `posts.published_id` e `publish_attempted` no D1. Só um responsável pode reconciliar o estado após verificar a Meta. Não limpe o bloqueio nem crie outra publicação antes disso.
- Não há cancelamento de agenda na interface. Se precisar interromper envios pendentes, desative `ENABLE_PUBLISHING` e faça deploy. Isso bloqueia o início do envio no processamento; não desfaz uma chamada já em andamento. Faça a alteração administrativa dos jobs com o Matheus.
- Mantenha os arquivos de mídia enquanto os posts existirem. Retenção, exclusão de dados e limpeza de imagens órfãs ainda precisam de uma política explícita. Não configure expiração automática que apague mídia de posts agendados.
- Faça backups/exportações do D1 e teste restauração; defina backup/versionamento de mídia e responsáveis pelos acessos. Guarde exportações como dados privados, nunca no repositório.
- Separe acesso ao painel Cloudflare da permissão de usar o estúdio. Proteja a conta Cloudflare com MFA, dê menor privilégio ao time e revise acessos quando alguém sair.
- A reconciliação administrativa, renovação automática do token, cancelamento, histórico visual e múltiplas contas são evoluções pendentes, não capacidades já entregues.

## Referências oficiais

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
- [Validação do JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
- [Secrets do Worker](https://developers.cloudflare.com/workers/configuration/secrets/).
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- [Browser Run e bindings](https://developers.cloudflare.com/browser-run/get-started/).
- [Instagram API — coleção oficial da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
