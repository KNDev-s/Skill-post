# Handoff para o Matheus

A implementação do backend é independente. O frontend consome `PostService`; troque apenas o modo/URL para conectar a implementação real.

Ponto de partida: `../docs/api.md` e `../src/types/post.ts` (schemas compartilháveis, sem dependência de React). A estrutura atual não impõe framework de Worker nem adiciona um stub que finja publicar.

Responsabilidades do backend:

1. Autenticar a equipe, autorizar cada post, validar payloads/Origin e limitar uso.
2. Carregar a skill original de `skill/`, quando ela for disponibilizada, e executar geração estruturada com regras de marca.
3. Renderizar mídia em 1080×1350 e guardar os arquivos. Devolver `imageUrl` para o preview; publicar as imagens renderizadas, nunca o HTML do navegador.
4. Guardar briefing, conteúdo, revisão, aprovação, status, timestamps e falhas em armazenamento durável.
5. Garantir controle de concorrência e idempotência. O servidor decide transições válidas.
6. Executar jobs de geração/publicação e agendamentos independentemente da aba do usuário. Devolver status pelo GET.
7. Integrar conta/credenciais de publicação, storage e provedores de IA somente no servidor.

Não utilizar a pasta `public/` para prompts internos, skill, credenciais ou conteúdo privado. Não devolver sucesso fictício enquanto uma integração estiver pendente: responder erro claro ou estado assíncrono real.

Decisões ainda abertas para a implementação do backend: provedor/modelo de IA, autenticação, banco, fila/agendador, renderer, retenção dos posts, storage/mídia e credenciais/contas de publicação. Não bloqueiam a construção da tela.
