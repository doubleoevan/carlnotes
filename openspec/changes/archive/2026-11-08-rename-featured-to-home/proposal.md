## Why

"Featured" is about to name a separate capability that users get with its own prompt. The admin's pinned-then-trending
sections on the home page need a name of their own first, so the two never share a word. The admin's removal of a pin
also went out without a confirmation from the console, and the Rank dialog asked only at Save, after the X.

## What Changes

- The home page's sections are Home topics and Home podcasts, in both apps, the topics directory's section, the
  Rank dialogs, the admin console, the structured data, and the docs.
- Code says home where it said featured: the `homeOrder` schema fields over the `feature_order` columns, which keep
  their names so the release before this one keeps reading them while this one deploys, the `homeTopics` and
  `homePodcastEpisodes` fields, the `home` topic section key and its `?home=` page param, the `/home-order` routes,
  the `admin:setHomeOrder` permission, the `home_card_open` event, and the module and component names. The Redis
  caches whose stored shapes changed take new keys. The frozen 0.1.0 contract renames the same three fields, since no
  app version has shipped.
- The X on a pinned row asks first, in the Rank dialog and in the admin console. Confirming clears that row at once.
  The X on the page's own row that is not pinned yet still only drops it.
- The remove dialog says "Remove this podcast episode?" and "Remove podcast episode", and the mobile menu matches the
  web's "Remove podcast episode".

## Impact

- `packages/db/schema/`, `packages/db/homeOrder.ts`, `packages/db/podcastEpisodeHomeOrder.ts`
- `apps/api/topic/homeOrder.ts`, `apps/api/podcast/podcastEpisodeHomeOrder.ts`, the home, feed, topic, podcast, and
  admin routes
- `packages/contracts/`, `packages/client/`, `packages/core/`, `contracts/0.1.0.json`
- `apps/web/src/components/common/HomeRankDialog.tsx`, `apps/web/src/components/admin/HomeOrderCard.tsx`, the home,
  topics, topic, podcast episode, and admin pages, and the mobile home and podcast episode screens
