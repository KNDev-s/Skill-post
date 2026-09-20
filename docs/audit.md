# Relatório de implementação e auditoria — KNDev's Social Studio

Data: 19/09/2026. Base inspecionada: branch `feature/social-creator-v1`, commit `e9582c8d93773d8963795cbd7cfb3f163c1aa2c9` do repositório KNDev-s/Skill-post. Implementação e validação realizadas localmente, com alterações preparadas para revisão por pull request. Nenhum deploy Cloudflare foi executado.

## Resultado

O projeto ganhou uma implementação de backend preparada para homologação no Cloudflare e a identidade visual oficial da KNDev's. O frontend continua usando o contrato `/api/v1`. Os testes locais passaram; eles não substituem a homologação dos serviços e das políticas na conta Cloudflare. Nenhuma publicação foi realizada no Instagram.

## Arquitetura encontrada

A interface React/TypeScript/Vite selecionava adapter mock ou HTTP em `src/services/index.ts`. O cliente em `src/services/api/http.ts` já enviava JSON, revisão e `Idempotency-Key`, com timeout e polling pelo hook `src/hooks/usePost.ts`. O contrato em `src/types/post.ts` já usava validação Zod.

O backend adicionado em `backend/` usava Fastify, OpenAI, renderer SVG/Resvg, arquivos locais e Instagram Graph API. Posts e chaves de idempotência ficavam em mapas na memória. O agendamento apenas alterava o estado, sem executor. A configuração Wrangler só hospedava `dist` no Pages; não executava esse servidor Node nem persistia suas imagens.

## Principais achados e tratamento

| Achado original                                                    | Risco                                                              | Tratamento implementado                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| API sem autenticação e CORS aceitando qualquer origem              | Acesso indevido e consumo de APIs                                  | Worker exige JWT assinado do Access; origem exata nas escritas e proprietário por post. Servidor antigo desativado.             |
| Mapas e disco local como armazenamento                             | Perda de posts, revisões e agenda                                  | D1 para posts/comandos/trabalhos e R2 privado para mídia.                                                                       |
| Agendamento sem executor                                           | Post marcado como agendado sem ser publicado                       | Cron persistente, independente do navegador, com reivindicação atômica.                                                         |
| Escritas concorrentes e idempotência incompleta                    | Sobrescrita e repetição de operações                               | Trigger D1 faz comando/revisão/job na mesma transação; todas as escritas são deduplicadas.                                      |
| Publicação sem aguardar processamento dos containers               | Falha de envio e status incorreto                                  | Consulta `status_code`; só segue quando `FINISHED`.                                                                             |
| Sucesso simulado quando faltavam credenciais ou imagens acessíveis | Interface indicar publicação inexistente                           | Falha explícita; `published` exige retorno de ID real.                                                                          |
| Falhas de provedor com mensagens brutas e fallback de IA           | Vazamento em erros e conteúdo fictício                             | Mensagens controladas, nenhuma resposta bruta/credencial no cliente e nenhuma simulação em produção.                            |
| Repetição após resposta de publicação perdida                      | Post duplicado                                                     | Bloqueio persistido antes de `media_publish`; resultado incerto requer reconciliação humana.                                    |
| Imagens locais e nomes sobrescritos                                | Meta não consegue baixar ou publica revisão errada                 | PNG/JPEG imutáveis por revisão; JPEG só por link assinado válido por até uma hora.                                              |
| Sem limite de geração no servidor                                  | Gastos inesperados                                                 | 30 gerações/24h global, 5 trabalhos pendentes por pessoa e 20 comandos/minuto/pessoa.                                           |
| Segredos apenas no `.env` do Node                                  | Configuração não chegar ao Worker, risco de colocá-los no frontend | `.dev.vars` local ignorado, scripts sem impressão de valores e instruções para Secrets do Cloudflare.                           |
| Fonte externa e identidade provisória                              | Dependência de terceiros e marca incorreta                         | Inter/Space Grotesk locais, logos originais, azul/coral/azul-noturno oficiais.                                                  |
| Dependências vulneráveis no backend legado                         | Falhas conhecidas em componentes instalados                        | Remoção de `@fastify/static`, `satori` e `@google/genai` sem uso no caminho suportado. Auditorias finais sem avisos conhecidos. |

A primeira auditoria do backend detectou três entradas: uma alta em `@fastify/static`, uma moderada em `fflate` e uma moderada refletida em `satori`. A correção removeu esses componentes do backend desativado. A instalação exploratória do Puppeteer também foi removida: a implementação usa o binding nativo de Browser Run e o projeto final não depende desse pacote.

## Segurança do caminho suportado

- Access: verificação de assinatura RS256, emissor, audiência, expiração e identidade; nenhuma confiança isolada em cabeçalho de e-mail.
- API: validação Zod, corpo de até 16 KiB, origem exata, JSON obrigatório, revisão e autorização no servidor.
- Banco: SQL parametrizado; comandos e mudanças de estado atômicos; o cliente não escolhe o proprietário.
- Mídia: bucket privado, autorização para preview e assinatura temporária para download pela Meta; nenhuma URL arbitrária enviada pelo usuário é renderizada.
- HTML dos slides: texto escapado, CSP restritiva, fontes/logo incorporados, bloqueio de scripts e requisições de dados no renderer.
- Interface: CSP, `nosniff`, proteção contra enquadramento, política de referenciador restritiva e respostas privadas sem cache. Só o ID do último post fica no `sessionStorage`; tokens e conteúdo não ficam ali.
- Provedores: token no cabeçalho Authorization, host da Meta restrito, timeouts e redirecionamentos recusados. Logs de jobs contêm apenas categoria, ID do post e indicação de tentativa de publicação.
- Publicação: desabilitada inicialmente; aprovação obrigatória; post agendado ou em processamento não é editável. Falha não é tratada como sucesso.

## Arquivos e trechos relevantes

| Arquivo / função                                                     | Responsabilidade e continuidade                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `wrangler.toml`                                                      | Configuração Workers/Assets, bindings D1/R2/Browser, Cron e variáveis públicas; substituir domínio, AUD e UUID do banco. |
| `worker/index.ts` / `fetch`                                          | Entrada HTTP, proteção de host, Access, mídia assinada e cabeçalhos de segurança.                                        |
| `worker/security.ts` / `authenticate`, `protectWrite`, `verifyMedia` | Controles de autenticação, origem e mídia.                                                                               |
| `worker/api.ts` / `api`                                              | Endpoints existentes, autorização, validação, aprovação, agenda e limites.                                               |
| `worker/store.ts` / `commit`, `replay`                               | Idempotência e escrita transacional.                                                                                     |
| `migrations/0001_posts.sql`                                          | Tabelas, índices, triggers de revisão e cotas. Aplicar antes de utilizar o Worker.                                       |
| `worker/jobs.ts` / `runJobs`                                         | Cron, recuperação de interrupções e barreira de publicação.                                                              |
| `worker/ai.ts` / `generate`                                          | OpenAI, formato JSON e limites para o texto caber no slide.                                                              |
| `worker/render.ts` / `slideHtml`, `renderSlide`                      | Arte 1080 × 1350, fontes/logo, PNG e JPEG no R2.                                                                         |
| `worker/meta.ts` / `prepareCarousel`                                 | Containers, espera de processamento e envio; token somente no servidor.                                                  |
| `src/services/api/`                                                  | Contrato HTTP preservado; frontend chama o próprio domínio em `/api/v1`.                                                 |
| `src/styles.css`, `src/config/brand.ts`, `public/brand/`             | Paleta, tipografia e assets oficiais.                                                                                    |
| `src/components/SlidePreview.tsx`, `src/pages/CreatorPage.tsx`       | Preview com logo real e indicação da fila no modo integrado.                                                             |
| `src/hooks/usePost.ts`                                               | Recuperação do último post na sessão, sem armazenar tokens.                                                              |
| `scripts/build-production.mjs`                                       | Build força modo API e mesma origem, mesmo com configuração local de demonstração.                                       |
| `scripts/prepare-local-secrets.mjs`                                  | Preparação local sem sobrescrever arquivo existente ou imprimir valores.                                                 |
| `scripts/check-meta.mjs`                                             | Consulta de identidade/permissões sem publicação e sem mostrar segredos.                                                 |
| `scripts/audit-secrets.mjs`                                          | Verificação de arquivos versionáveis, build, histórico Git local e exclusão dos arquivos de segredos.                    |
| `.github/workflows/ci.yml`                                           | Tipos, testes, build, dry run, auditoria de dependências e verificação de segredos no CI.                                |
| `backend/src/server.ts` e scripts do backend                         | Desativação do servidor antigo; módulos preservados como referência.                                                     |

## Validações realizadas

| Verificação                  | Resultado e alcance                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript frontend e Worker | Compilação local aprovada.                                                                                                                                                                    |
| Testes unitários existentes  | 16 passaram: contrato, estado, revisão, adapter e erros.                                                                                                                                      |
| Testes do Worker             | 15 passaram: JWT, origem, corpo, assinatura de mídia, D1/R2, concorrência, quotas, geração e publicação simulada.                                                                             |
| Navegador / arte             | 11 passaram: desktop, celular, adapter HTTP, render 1080 × 1350 e texto adversarial.                                                                                                          |
| Regressão do backend antigo  | 4 passaram; nenhum teste enviou conteúdo à Meta.                                                                                                                                              |
| Build e Wrangler dry run     | Pacote do Worker/Assets montado sem deploy.                                                                                                                                                   |
| Dependências                 | `npm audit` sem vulnerabilidades conhecidas reportadas na raiz e no backend após remoções.                                                                                                    |
| Segredos                     | Scanner sem achados nos arquivos/build e histórico Git local consultado; `.env` e `.dev.vars` ignorados. Verificação heurística, não uma garantia sobre cópias externas ou logs de terceiros. |
| Meta real                    | Leitura de identidade aprovada e ID correspondente à conta configurada. Permissões de publicação e validade do token ainda precisam de confirmação.                                           |
| Cloudflare real              | A máquina não estava autenticada no Wrangler. Nenhum recurso ou deploy foi criado.                                                                                                            |

Os testes de D1/R2 usam o emulador local; chamadas OpenAI, Browser Run e publicação Meta são simuladas nesses testes. A arte foi renderizada e inspecionada no Chromium local usando o template do Worker. Não foi executada a cadeia completa de publicação com provedores reais.

## Paleta aplicada

Azul principal `#1739DA`, azul elétrico `#134AFB`, coral `#F9543B`, azul-noturno `#071426`, superfície `#0E1A32`, grafite `#35393D`, branco `#FEFEFE` e branco azulado `#F3F6FF`. Inter nos textos; Space Grotesk nos títulos. Coral fica em pequenos destaques. As cores de estado de erro/aviso/sucesso foram mantidas com função semântica.

Os logos não foram redesenhados, recortados ou recoloridos. A inspeção mostrou que `logo-dark.png` é a variante clara para fundo escuro; ela foi aplicada na lateral e nos slides. O preview demonstrativo segue a identidade, mas a imagem de produção é a arte persistida no R2.

## Pendências externas e limites operacionais

1. Login Cloudflare, domínio e e-mails da equipe; criação/configuração de Access, D1, R2, Browser Run e Cron.
2. Cadastro dos secrets e configuração dos identificadores públicos no Wrangler.
3. Verificação de permissões Meta, funções do app, conta profissional, validade/renovação do token e suporte da versão da API. A resposta de identidade não comprova publicação autorizada.
4. Homologação de Access real, geração/renderização no Browser Run, acesso da Meta à mídia e primeira publicação aprovada.
5. Alertas de gasto, acompanhamento de falhas, backup/recuperação, retenção e exclusão de dados.
6. Recursos ainda não implementados: renovação automática de token, reconciliação administrativa por tela, cancelamento de agenda por tela, galeria de histórico e múltiplas contas.

O processamento inicia um job por minuto, com prioridade para publicação; a agenda é aproximada. Interrupções viram falha após 16 minutos e exigem revisão. O bloqueio de repetição reduz o risco de duplicidade no mesmo post, mas não impede alguém de criar manualmente um novo post com o mesmo conteúdo. Não há promessa de entrega exatamente uma vez pela API externa.

O servidor legado está desativado, não completamente reescrito ou certificado. Seus módulos antigos não devem ser usados para expor uma API paralela. As novas garantias valem para o Worker, sujeito à configuração correta e aos limites descritos.

## Próximo passo

Siga `docs/cloudflare.md` na ordem: configurar recursos e Access, cadastrar secrets, implantar com publicação bloqueada, confirmar a Meta, homologar e só então liberar uma publicação de teste. Esse guia contém os comandos e as verificações esperadas de cada etapa.
