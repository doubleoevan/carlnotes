## Why

Home topics and Home podcasts read as the page's name repeated, not as a pick. Customers should read Featured topics
and Featured podcasts, while the code keeps home so that featured stays free for the separate user capability.

## What Changes

- The home page sections, the topics directory, the Rank menu options and dialogs, the admin console, the docs, and
  the structured data read Featured topics and Featured podcasts.
- Identifiers, routes, columns, and events keep home.

## Impact

- Copy in `packages/core/lib/homeFaces.ts`, `packages/core/lib/topicFeedLabels.ts`, `packages/contracts/seo.ts`, the
  web menus and Rank dialog, and the docs. No api or schema change.
