# Contrato HTTP · v1

Fonte dos tipos e validação: `src/types/post.ts`. Interface de operações: `src/services/post-service.ts`. Base configurável, normalmente `/api/v1`. O frontend não usa SDK da IA, Meta, R2 ou Cloudflare.

## Implementação Cloudflare

O Worker em `worker/` implementa as operações abaixo. Requer domínio HTTPS oficial e JWT válido do Cloudflare Access. Cada post e imagem pertence ao `sub` autenticado; não há compartilhamento de posts entre usuários nesta versão.

Todas as escritas exigem `Origin` igual a `APP_ORIGIN`, `Content-Type: application/json` e `Idempotency-Key` no formato UUID. O servidor limita o corpo a 16 KiB e valida campos/revisão. A idempotência vale para todas as escritas, não apenas criação; a mesma chave com dados diferentes retorna `409`. A resposta original do comando é preservada; use GET para consultar o estado mais recente.

O agendamento aceita de um minuto a 30 dias no futuro e valida o fuso IANA. Cron inicia um trabalho por minuto, priorizando publicação. `202` significa persistido na fila, sem garantia de execução no segundo exato. Revisões também avançam quando jobs iniciam/terminam. Posts agendados, em processamento, publicados ou com falha não aceitam edição.

Além das operações do frontend, há `GET /posts`, retornando `{ data: Post[] }` com os 30 posts mais recentes do proprietário, e `GET /posts/:id/media/:slideId/:revision.png` para a imagem privada. Os IDs criados pelo Worker são UUIDs; IDs das rotas aceitam letras, números e hífen. A listagem ainda não possui tela dedicada.

A rota externa `/media/:postId/:revision/:slideId.jpg` fica fora desta base e só aceita GET com assinatura e expiração válidas. Ela é exclusiva para imagens persistidas no R2 e não aceita URLs arbitrárias.

O renderer usa título de até 90 caracteres e corpo de até 260 para caber na arte; o DTO geral mantém os limites maiores para compatibilidade. Sem IA configurada, renderer funcional, aprovação ou publicação habilitada, não há sucesso simulado. Respostas de erro não incluem tokens nem mensagens brutas de provedores.

## Endpoints

Todos retornam JSON `{ "data": Post }`. `200`/`201` para resultado concluído; `202` para operação aceita, incluindo **o Post completo** com status intermediário. Não retornar `204`.

| Método | Caminho relativo à base                 | Request                               |
| ------ | --------------------------------------- | ------------------------------------- |
| POST   | `/posts`                                | `GeneratePostRequest`                 |
| GET    | `/posts/:id`                            | —                                     |
| POST   | `/posts/:id/regenerate`                 | `{ revision }`                        |
| POST   | `/posts/:id/slides/:slideId/regenerate` | `{ revision }`                        |
| PATCH  | `/posts/:id/caption`                    | `{ revision, caption }`               |
| POST   | `/posts/:id/approve`                    | `{ revision }`                        |
| POST   | `/posts/:id/publish`                    | `{ revision }`                        |
| POST   | `/posts/:id/schedule`                   | `{ revision, scheduledAt, timeZone }` |

```json
{
  "topic": "Como a automação transforma pequenos negócios",
  "slideCount": 3,
  "tone": "educativo",
  "objective": "leads"
}
```

`topic`: 5–300 caracteres após trim. `slideCount`: 3, 5, 7 ou 10. `tone`: `educativo | inspirador | direto | descontraido`. `objective`: `autoridade | leads | engajamento | produto`.

```json
{
  "data": {
    "id": "post_123",
    "revision": 1,
    "status": "ready",
    "brief": {
      "topic": "Como a automação transforma pequenos negócios",
      "slideCount": 3,
      "tone": "educativo",
      "objective": "leads"
    },
    "slides": [
      {
        "id": "slide_1",
        "layout": "cover",
        "title": "Mais tempo para crescer",
        "body": "Simplifique sua rotina."
      },
      {
        "id": "slide_2",
        "layout": "content",
        "title": "Comece pelo repetitivo",
        "body": "Identifique um processo manual."
      },
      {
        "id": "slide_3",
        "layout": "closing",
        "title": "Vamos conversar?",
        "body": "Conheça a KNDev's."
      }
    ],
    "caption": "Uma ideia para simplificar seu dia. #KNDevs",
    "createdAt": "2026-09-18T12:00:00.000Z",
    "updatedAt": "2026-09-18T12:00:00.000Z"
  }
}
```

Slide: `id`, `title` (até 300), `body` (até 2000), `layout` e `imageUrl?` (URL HTTP(S), HTTPS em produção). O número de slides deve corresponder ao briefing, exceto durante `generating`/`failed`; IDs únicos. Legenda de até 2.200 caracteres. `scheduledAt`/`publishedAt` são timestamps UTC ISO 8601 com `Z`; `timeZone` é IANA, como `America/Sao_Paulo`. Em `scheduled`, `scheduledAt` e `timeZone` são obrigatórios; em `published`, `publishedAt` é obrigatório. `failure?` contém uma mensagem legível em caso de erro da tarefa.

## Estados e concorrência

```text
POST /posts → generating → ready
ready → approve → approved
ready/approved → editar legenda ou regenerar → ready (ou generating → ready)
approved → publish → publishing → published
approved → schedule → scheduled → publishing → published
generating/publishing → failed
failed → regenerar tudo → generating → ready (nova revisão/aprovação)
```

`Gerando` também aparece enquanto o POST inicial está em andamento. Agendamento e publicação só são liberados para a revisão aprovada. Conteúdo agendado/publicado é somente leitura nesta V1. Gerar outro briefing cria um **novo** post, não cancela nenhum agendamento já criado. Cancelamento e histórico ficam fora desta V1.

O servidor deve rejeitar `revision` antiga com `409 CONFLICT`, validar estado/transição e fazer a alteração de forma atômica. Publicar duas vezes nunca deve criar duplicatas. A mudança de legenda ou de qualquer slide invalida a aprovação. A aprovação é vinculada ao conteúdo/revisão, não só ao ID do post.

## Idempotência, timeout e falhas

Escritas enviam `Idempotency-Key` (UUID por comando). O backend precisa deduplicar recebimentos da mesma chave e, adicionalmente, impor unicidade por post/revisão para publicação e agendamento. Não há retry automático de escrita. Um novo clique é um novo comando/chave; use revisão e estado para impedir repetição de efeitos.

Se a conexão cair depois que o backend recebeu o pedido, o frontend não pode concluir que ele foi desfeito. Para um post conhecido, **Atualizar status** consulta o resultado. O fluxo de criação inicial não tem recuperação por chave nesta V1: pode existir um rascunho criado após timeout. O backend deve ter logs/rastreabilidade e poderá acrescentar busca/histórico em uma próxima versão; criar novamente nunca deve publicar automaticamente.

Polling é sequencial: 2 segundos por padrão em `generating`/`publishing`; 15 segundos no mínimo em `scheduled`. Falhas de polling pausam consultas até atualização manual. Os intervalos não representam execução de agendamento: o servidor deve executar a tarefa mesmo com o navegador fechado.

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "O post foi atualizado. Atualize o status antes de continuar.",
    "requestId": "req_123"
  }
}
```

Códigos sugeridos: `VALIDATION` (400/422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT`/`INVALID_STATE` (409), `RATE_LIMITED` (429), `GENERATION_FAILED`/`PUBLICATION_FAILED` (5xx). Não incluir tokens nem detalhes internos em mensagens públicas. Respostas inválidas, HTML (inclusive fallback da SPA) e falhas de rede viram erro visível; não existe fallback automático para mock.

## Sessão e CORS

Nenhum token secreto é enviado pelo frontend. O client suporta cookies (`same-origin` ou `include` configurável). Para origens diferentes, responder OPTIONS com origem exata permitida, `Access-Control-Allow-Credentials: true` se usar cookies, métodos `GET, POST, PATCH, OPTIONS`, headers `Content-Type, Idempotency-Key`. Validar Origin/CSRF no backend para comandos autenticados por cookie. `*` não serve para requisições com credenciais. Definir autenticação de equipe/Cloudflare Access antes de disponibilizar dados reais.
