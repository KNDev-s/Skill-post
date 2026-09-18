# Skill original — aguardando arquivos

Em 18/09/2026 o repositório estava vazio. A conversa “Automação Da Skill” referenciava uma skill já desenvolvida, mas não trouxe os arquivos nem anexos. Por isso, a entrega não afirma incluir a skill original e não inventa regras de marca.

Quando os arquivos forem disponibilizados, adicionar aqui a pasta original preservando nomes, conteúdo e assets. Os nomes citados na conversa foram:

- `SKILL.md` ou `skill.md` (manter a grafia original)
- `BRAND.md`
- `SOCIAL_SKILL.md`
- `OUTPUT_RULES.md`
- logos `logo-primary`, `logo-white`, `logo-dark`, fontes e outros assets

O backend deve ler os arquivos pertinentes. Esta pasta não é importada pelo frontend nem copiada para `dist/`. Copiar para `public/brand/` apenas os assets de marca aprovados para exibição pública; nunca prompts privados ou secrets.

O mock é um conjunto de exemplos determinísticos para testar a interface. Ele **não executa** nem substitui a skill.
