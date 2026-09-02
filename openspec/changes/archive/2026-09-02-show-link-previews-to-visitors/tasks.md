## 1. The visibility check

- [x] 1.1 Widen `isTopicFindingVisible` in `api/topic/permissions.ts` to `userId: string | null`
- [x] 1.2 Answer false for an `invite` Topic when there is no user, instead of asking `subscriptionActivatedAt` for a subscription nobody holds
- [x] 1.3 `toTopicRole(null, ...)` returning null is already covered in `permissions.test.ts`, which is what makes the
      widened signature safe. `isTopicFindingVisible` itself reads the database, and no api test in this repo does,
      so its two branches are verified against the running app in 6.2

## 2. The finding preview route

- [x] 2.1 Drop the signed-in rejection in `GET /topic-findings/:id/link-preview`, keeping the visibility check as the only gate
- [x] 2.2 Confirm the other finding routes — rating, consume, bookmark, view — keep their signed-in rejection
- [x] 2.3 Verified against the running app: a public Topic's finding serves its card with no session, a private one 404s

## 3. The fetch limit, deliberately not added

- [x] 3.1 No hourly limit on the finding path. The url comes from an existing Resource row so a caller cannot name a
      page, and `isLinkPreviewStored` short-circuits before any fetch, so one url is fetched once a week however many
      times it is asked for. There is no amplification to bound, and a limit tight enough to matter would blank the
      cards on the pages visitors arrive on

## 4. The image route

- [x] 4.1 Drop the signed-in rejection in the link preview image route in `api/chat/room.ts`
- [x] 4.2 Change `PREVIEW_IMAGE_CACHE_CONTROL` from `private` to `public`, so the CDN holds an image that is now identical for every viewer

## 5. The popup

- [x] 5.1 Remove the `isSignedIn` condition around the fetch in `ui/src/components/topic/TopicResource.tsx`
- [x] 5.2 Start the loading flag true for every visitor instead of only a signed-in one

## 6. Ship

- [x] 6.1 Run `bun run check`
- [x] 6.2 Verified with no session against the running app: a public finding's card serves 200 with its title and
      `imagePath`, a private finding's 404s, the image route serves 200 with `public, max-age=86400`, and a public
      Topic still answers `chatTurns: []` with `isSignupRequired: true`
- [ ] 6.3 Confirm the same on prod after deploy, including that a signed-out visitor sees the card in the popup itself
