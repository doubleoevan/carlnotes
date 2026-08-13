## 1. The query client

- [x] 1.1 Install `@tanstack/react-query` with bun
- [x] 1.2 Wrap `<App />` in a `QueryClientProvider` in `ui/src/main.tsx`, with defaults matching today's behavior: no focus re-fetch, no automatic retry

## 2. The feed query

- [x] 2.1 Replace the provider's `useState` feed with `useQuery` on `['topic-feed', session?.user?.id ?? null]`, `fetchTopicFeed(true)` as the query function
- [x] 2.2 Delete `latestReloadRef` and the `isSignedIn` re-fetch effect, both covered by the key
- [x] 2.3 Keep `reload` in the context value as an invalidate-and-refetch that still reports whether fresh data landed
- [x] 2.4 Keep `reheat` reading that report before bumping `reheatKey`, so the hydrate replay is unchanged

## 3. The finding mutations

- [x] 3.1 Convert `consume`, `open`, `rate`, and `bookmark` to `useMutation` calls around their `sendTopicFinding*` functions
- [x] 3.2 Invalidate the topic-feed key on each mutation's success, in place of `await reload()`

## 4. The Stack line

- [x] 4.1 Add `TanStack Query` to the README's Stack line

## 5. Verification

- [x] 5.1 Exercise the feed in the browser: load, reheat animation replay, and a finding mutation re-fetching the feed. The per-user key is shown by the signed-in and signed-out origins fetching independently, in place of driving a sign-out
- [x] 5.2 Confirm the topic page's `reload` still refreshes the homepage feed after its writes
- [x] 5.3 `bash scripts/preflight.sh` green
