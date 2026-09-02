## Why

A public Topic's finding popup shows a link preview card for the page it found. That card is one of
the clearest things the product does — it is what makes a finding read as a real page instead of a
row of text — and a signed-out visitor never sees it.

Three separate gates hide it, and none of them protects anything. The preview cache is one row per
url, unique platform-wide. Its text is encrypted with one app-wide key, so every viewer decrypts the
same bytes. A preview's id is a random uuid, so the "probed by a stranger" the image route defends
against cannot enumerate ids in the first place — the only way to hold an id is to have been served
a finding that already passed a visibility check.

## What Changes

- `GET /topic-findings/:id/link-preview` SHALL serve a signed-out visitor, keeping the per-finding
  visibility check that already decides what a visitor may see.
- `isTopicFindingVisible` takes `userId: string | null`. Its switch already answers correctly for an
  anonymous visitor: public yes, private no. `toTopicRole` already accepts null.
- The finding popup fetches its preview for every visitor instead of only a signed-in one.
- The link preview image route drops its signed-in check, and its `Cache-Control` becomes `public`
  so the CDN can hold an image that is now the same for everyone.
- The finding preview path gets no fetch limit, deliberately. `isLinkPreviewStored` short-circuits
  before any fetch, so one url is fetched once a week however many times it is asked for, and the url
  always comes from an existing Resource row. There is no amplification for a limit to bound, and one
  tight enough to matter would blank the cards on the pages visitors arrive on.

Public Topic chat history stays hidden from a signed-out visitor. That gate is a separate decision
and this change does not touch it.

## Capabilities

### Modified Capabilities

- `link-previews`: a preview and its image are visible to anyone who may see the finding, and the
  finding path adds no fetch limit of its own.

## Impact

- `api/topic/findings.ts`: the finding preview route's signed-in rejection.
- `api/topic/permissions.ts`: `isTopicFindingVisible` widens to an optional user.
- `api/chat/room.ts`: the image route's signed-in rejection and its cache header.
- `api/chat/linkPreviews.ts`: unchanged, and deliberately unlimited on the finding path.
- `ui/src/components/topic/TopicResource.tsx`: the signed-in condition around the fetch.
- No schema change. No migration.
