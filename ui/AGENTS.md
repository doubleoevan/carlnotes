# ui/

Vite React SPA. Entry `ui/src/main.tsx` → `App.tsx` holds the routes.

- `pages/` — one file per route; `components/<area>/` — components by domain area.
- `components/primitives/` is reserved for shadcn; custom shared components go in `components/common/`.
- `components/table/` — the page tables; `lib/` — `utils.ts` and small pure client-side helpers.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team surfaces.
- `components/share/` — the share menus for a topic and a team, over the options they both use.
- `components/avatar/` — the user and team avatar pickers, over the upload pieces they both use.
- `clients/` — one typed API client per domain (`hc<AppType>`), named `<domain>Client.ts`.
- `stores/` — app state one module owns and any component may read, named `<thing>Store.ts`. Each keeps
  its value in module scope, publishes to a listener set, and exposes `useSyncExternalStore` hooks, so
  two components read one live value with no provider wrapping them. Reach for a store only when state
  outlives a page or crosses the tree; `useState` and `providers/` cover everything else.
- `hooks/` — shared React hooks; `providers/` — context providers; `assets/` — images the bundler inlines.
- Imports: `@shared/*` and `import type { AppType }` only; no runtime import from api, worker, or db.
- `.tsx` is exempt from the comment-groups hook; keep the comment style anyway.
- Dev: `bun run dev:ui` (port 5173). Build: `bun run build:ui`. Tests: `bun test ui/src`.
