## 1. The web service

- [ ] 1.1 `packages/pages`: the page chain from `apps/api/index.ts`, `content`, `documents`, `seo`, `jsonLd`, the
      release pages split from the webhook, `share/*`, `avatars`, `avatarsRoute`, `favicons`, the podcast feed and
      cover routes, `botAnalytics`, `edgeCache`, `trustedProxies`, `requestTracing`; `apps/api` mounts it where the
      routes were
- [ ] 1.2 `apps/web/server.ts`: the health routes, the pages package, the ui render from `apps/web/dist`, its own
      gauge line; `API_ORIGIN` read in `router.tsx` for the server render; the `web` and `api` root scripts
- [ ] 1.3 `apps/api/chat/attachmentExtraction.ts` and its worker file: one persistent Bun `Worker`, bytes transferred,
      the text or the error answered; `attachments.ts` awaits it in `extractText`'s place
- [ ] 1.4 `packages/db/index.ts` default pool count 11 and its comment; `infra/northflank/release-main.json` gains
      `deploy-web`; the design's Northflank table and routing rules
- [ ] 1.5 Tests: the web server's health and page routes over the fake bundle in `indexTestFixtures.ts`, the api still
      serving every page path, the worker thread's text and error paths, the pool count
- [ ] 1.6 Docs: `AGENTS.md` module map and routing table, the `pages` and `web` AGENTS files, the README's process
      table and deploy section, the Notion Deployment page after the flip
- [ ] 1.7 Manual steps 16 to 21: the `web` service, sizes, `DATABASE_POOL_COUNT`, the path routes, the cache check,
      the uptime monitors; the load test before and after, both p99 readings recorded in `design.md`
