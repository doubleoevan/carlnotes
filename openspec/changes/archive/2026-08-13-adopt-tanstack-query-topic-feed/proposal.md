## Why

`TopicFeedProvider` hand-rolls what a query library gives for free: a `useState<TopicFeedResponse | null>` cache, a `latestReloadRef` counter so a slow overlapping request cannot land last and render a stale feed, an `isSignedIn` re-fetch effect, and four finding handlers that each end in `await reload()`. Every future client fetch would grow the same scaffolding. Adopting TanStack Query in this one provider replaces the hand-written pieces with the library's, and sets the pattern the other clients follow later.

## What Changes

- Install `@tanstack/react-query` and wrap the app in a `QueryClientProvider` in `main.tsx`.
- Replace the provider's feed state with a `useQuery` keyed on `['topic-feed', session?.user?.id ?? null]`, with the existing `fetchTopicFeed(true)` as its query function. The session id in the key replaces the `isSignedIn` re-fetch effect, and the query's own stale-response handling replaces `latestReloadRef`.
- Convert `consume`, `open`, `rate`, and `bookmark` to `useMutation` calls wrapping their existing `sendTopicFinding*` functions, invalidating the topic-feed query key on success in place of each handler's `await reload()`.
- Keep `reheat` as a manual `refetch()` plus the existing `reheatKey` bump, so the hydrate-replay animation is unchanged.
- Keep the context's public API unchanged — `useTopicFeed` (including its `reload`), `useTopicFeedActions`, `useIsSignedIn` — so consuming components need no changes.
- Add TanStack Query to the README's Stack line.

Out of scope: optimistic updates on rate/bookmark/consume, and migrating `activityClient`, `billingClient`, `profileClient`, or `chatClient` — those follow this pattern in later changes. The route-based filter reset (view/sort/resourceKinds/tagFilters on pathname change) stays as-is: it is local UI state, not data fetching.

## Capabilities

### New Capabilities

- `project-docs`: the README's Stack line names the core dependencies the app runs on

### Modified Capabilities

None.

## Impact

- `package.json`: one new dependency, `@tanstack/react-query`
- `ui/src/main.tsx`: the `QueryClientProvider` wrapper
- `ui/src/providers/TopicFeedProvider.tsx`: the query, the mutations, and the deleted race guard
- `README.md`: the Stack line
