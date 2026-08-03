# Ambientes e deploys

## Identificadores não secretos

| Ambiente | Aplicação | Supabase |
|---|---|---|
| Produção | `https://studiosp.vercel.app` | `ixttqwjfaeybaisglxee` |
| Staging | projeto/alias Vercel ligado à branch de staging | `ffeyrxsdlgcfwgnsnwlj` |

Confirme os vínculos efetivos antes de qualquer migration ou publicação. Os IDs acima não substituem a inspeção do projeto selecionado.

## Regras

- Feature nova: branch/worktree separada e Supabase staging.
- Migration: arquivo versionado, aplicado primeiro em staging.
- Produção: somente com autorização explícita, testes proporcionais ao risco e rollback conhecido.
- Variáveis: permanecem no provedor/ambiente; nunca copiar valores para Git ou relatórios.
- WhatsApp real: usar apenas números controlados autorizados pelo dono.

## Baseline de validação

Antes de merge/publicação, executar quando aplicável:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Registre o total de testes e qualquer aviso relevante. Build aprovado não equivale a homologação visual ou operacional.

## Orca

Foram observados dois registros locais do mesmo repositório. O clone ativo em `C:\Users\arthu\orca\Studiosp` estava no commit `a7f2443`, atrás da referência `b04b65f`. Antes de iniciar desenvolvimento:

1. escolher um único registro oficial no Orca;
2. atualizar com fast-forward a partir de `origin/main`;
3. manter `main` limpa;
4. criar uma worktree por tarefa;
5. usar comentários/status do worktree para registrar progresso.

Não use `reset --hard` para sincronizar; preserve qualquer mudança local e prefira `pull --ff-only` após confirmar worktree limpo.

