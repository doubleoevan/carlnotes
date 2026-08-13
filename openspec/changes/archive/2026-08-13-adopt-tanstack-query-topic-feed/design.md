## Context

`TopicFeedProvider` owns the one shared feed instance: a `useState` cache filled by `reload`, a `latestReloadRef` counter that lets only the newest in-flight request write, an effect that re-fetches when sign-in state flips, and `consume`/`open`/`rate`/`bookmark` handlers that each call their `sendTopicFinding*` client function and then `await reload()`. `reheat` wraps `reload` with a `reheatKey` bump that remounts the feed sections to replay the hydrate animation. Everything else in the provider — view, sort, resource-kind and tag filters, and the pathname reset — is local UI state.

## Goals / Non-Goals

**Goals:**

- The feed's fetching, caching, and stale-response handling come from TanStack Query instead of hand-written state.
- The context's public API is unchanged, so no consuming component changes.
- The pattern is in place for the other clients to follow in later changes.

**Non-Goals:**

- Optimistic updates. Mutations invalidate and re-fetch, the same observable behavior as today's `await reload()`.
- Migrating `activityClient`, `billingClient`, `profileClient`, or `chatClient`.
- Any change to the filter state or its pathname reset.

## Decisions

**The query key carries the session user id.** `['topic-feed', session?.user?.id ?? null]` re-fetches when the signed-in user changes, which is what the `isSignedIn` effect did, and also distinguishes one user's cached feed from another's after a sign-out and sign-in.

**The race guard goes.** TanStack Query keeps one active request per key and discards a stale response when a newer request for the same key is in flight, which is exactly what `latestReloadRef` guarded.

**`reload` stays in the context value.** The topic page calls it after its own writes. It becomes an invalidate-and-refetch of the topic-feed key and keeps returning whether fresh data landed, which `reheat` reads before bumping `reheatKey`.

**Mutations invalidate rather than write the cache.** Each of the four handlers wraps its existing `sendTopicFinding*` function in a `useMutation` whose success invalidates the topic-feed key. Same server round trips as today, minus the hand-written plumbing.

**One `QueryClient` at the app root.** `main.tsx` wraps `<App />` in a `QueryClientProvider`, so later changes can adopt queries anywhere without more setup.

## Risks / Trade-offs

**Default query behaviors differ from the hand-rolled fetch.** TanStack Query re-fetches on window focus and retries failures by default. Configure the client (or this query) so behavior matches today's — no focus re-fetch surprises during rollout — and loosen deliberately later.

**`reheat`'s success signal must survive the port.** Today `reload()` returns false for a lost race or a failed fetch, and `reheat` only replays the animation on true. The refetch result carries the same information; the port keeps that contract.
