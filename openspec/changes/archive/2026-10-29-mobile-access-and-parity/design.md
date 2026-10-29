# Design

## Context

See proposal.md for the gaps. What shapes the approach:

- The root layout already splits the screens into three guards: public reading (`(tabs)`, profiles, teams, topics,
  episodes, notes) for any session that is not retired, account screens and chat for a signed-in user, and the session
  screens for a visitor. `plans` sits in the signed-in group though the web serves it publicly. A visitor who lands on
  a signed-in route falls to Expo Router's own fallback, Home, with no sign-in prompt.
- The shared pieces the web badges stand on are in `packages/core` already: `chatRoomStore` with `useAllChatMentions`,
  `useTopicMentions`, and `useTeamMentions`, `noteBadgeStore`, `topicInviteStore`, `useNoteBadges` with its
  focus-and-online gate and account generation, `UserMenuItems` with `renderBadge`, and `activePoll`. What is web-only
  is the composition: `UpdateCountBadge.tsx` with its sum, labels, tooltip sections, and the menu and page variants,
  and `usePollBadges` in `AppChatPanel`, an ungated `setInterval` at 45 seconds.
- Mobile count reads go through TanStack Query with `refetchInterval` and a pathname gate for the Topic counts, and
  through a mount-only query for the Podcast Episode counts whose `queryFn` returns null on failure. The account
  `QueryClient` is keyed by `userId` and cleared on account change, and `focusManager` follows `AppState`.
- The mobile api client's `headers` function runs on every request and returns the device headers and the session
  `cookie`. Hono's `headers` option takes no arguments, so no call can leave the cookie off today. The web counts
  client marks a public read with `credentials: "omit"`.
- The web keeps a visitor's page in `?next=` through login and sign-up and OAuth's `callbackURL`. The app keeps one
  in-memory return path, `sessionReturnPath.ts`, consumed by the root layout once a session arrives, set today only by
  the Podcast Episode gate. The sign-up prompts, `SIGNUP_PROMPTS`, and the invite rejection copy live under
  `apps/web/src`.
- `theme.ts` already knows `"system" | "light" | "dark"` and stores the choice in AsyncStorage, but `setThemePreference`
  accepts only a palette. The api already enables GitHub beside Google and Apple, and the Better Auth Expo client opens
  the browser for any provider whose response redirects.
- `scripts/` has `readSourceFiles`, a regex import parser in `importBoundaries.ts` that keeps only the specifier, and
  the component parity check over Nightshift contracts. No file-level import graph exists.

## Goals / Non-Goals

**Goals:**

- One implementation per shared behavior: the badge poll, the update count composition, the sign-up prompts, and the
  invite rejection copy each live in `packages/core` and are consumed by both apps through thin adapters.
- No request from a background app and no number polled twice on one screen. A focused screen's requests per minute
  are stated in the mobile AGENTS.md.
- Every visitor action that needs an account prompts in Carl's words and returns the visitor to the same content.
- The parity check proves reachability through shared modules, fails on a new unmatched capability, and fails on a
  stale inventory entry.

**Non-Goals:**

- Verified `https` app links, the domain association files, and the store release (Prompt 51).
- Another podcast player or any change to playback (Prompt 48 shipped it).
- A system appearance option on the web. The browser follows the system preference until a palette is saved, and
  the web keeps that behavior.
- A decline step or an already-accepted notice on the invite token page. The web has neither, and the web is the
  reference.
- Push notifications, voice chat, attachments and new-topic chat, podcast questions, and store payments. They stay in
  the inventory against their prompts.

## Decisions

**1. One shared badge poll hook, gated like `useNoteBadges`.** `packages/core/hooks/useUpdateBadges.ts` polls the chat
mention count and the pending topic invitations every 45 seconds while `focusManager.isFocused()` and
`onlineManager.isOnline()`, refreshes on focus and reconnect, keeps one request in flight per source, and guards every
response with `toCurrentChatAccountGuard` and a request version, the pattern `useNoteBadges` already uses. When the
mention count changes it reloads the chat rooms into `chatRoomStore`, and both apps' room lists read the store. The
web's `AppChatPanel` replaces `usePollBadges` with it, which also stops its hidden-tab polling. The app mounts it once
in the root layout, beside `activateChatAccount`, since its `AppChatPanel` unmounts on the chat routes, and it polls
nothing without a user.
*Alternative:* fold the note badge poll into the same timer. Rejected: `useNoteBadges` has its own generation store
and the note-read rollback, and the two timers poll different numbers, so there is no duplicate request to remove.
*Alternative:* leave the web's `setInterval` and write a native poll on `activePoll`. Rejected: two copies of the same
poll, and the web would keep polling a hidden tab.

**2. The update count composition moves to core with injected elements.**
`packages/core/components/UpdateCountBadge.tsx` owns the sum, `toUpdateLabel`, the tooltip sections with their
headings and "and N more" folding, and the `MenuTriggerUpdateCountBadge` and `PageUpdateCountBadge` variants, taking an
`elements` object for the count badge, the link, the status wrapper, the label span, and the explanation (tooltip on
the web, long-press sheet on the app), the
way `UserMenuItems` takes its elements. `apps/web/src/components/common/UpdateCountBadge.tsx` and
`apps/mobile/src/components/common/UpdateCountBadge.tsx` become adapters, and the app gains `common/CountBadge.tsx` on
the Nightshift Badge primitive. The native badge's accessible label is the web's screen reader text, and a long press
opens a `Sheet` with the same sections, the native replacement the mobile AGENTS.md names for a tooltip-only
explanation. The page badge's link maps `/topics/:id?chat=teamId` to the app's `/topics/[topicId]/chat` through the
existing `chatNavigation.ts`.

**3. Native placements mirror the web list.** Menu trigger (`MenuTriggerUpdateCountBadge` on the hamburger), the
Profile, Teams, and Activity items through `UserMenuItems`'s `renderBadge`, the chat launcher pill, the room menu
trigger and each room in `ChatOptionsMenu` and `ChatScreen`, `PageUpdateCountBadge` on the Topic header, the Feed's
Topic cards, the Team header, and the Team membership rows, and the invitation badge on the Activity title. The web
tab title's leading count has the app icon's badge as its counterpart: `appIconBadge.ts` sets it from the same sum
through `expo-notifications`, clears it for a visitor and on sign-out, and on iOS asks for the badge permission once,
the first time a signed-in user has a count, with alerts and sounds off. Until push notifications ship, the number
changes only while the app is open. `expo-notifications` is a native module, so the development client is rebuilt.

**4. Episode counts poll through the same hook as Topic counts.** `apps/mobile/src/hooks/usePolledCounts.ts`, named
after the web's hook, wraps the `useQuery` the Topic counts line already runs: `refetchInterval` and `staleTime` at
60 seconds, `enabled` while the pathname is the screen's route, the fetch's `signal` passed so a cache clear aborts
it, and a failed read that throws so the last counts stay. Both counts lines use it.
*Alternative:* a `startActivePoll` loop. Rejected: Query already pauses in the background through `focusManager` and
dedupes, and the Topic line proves the pattern.

**5. The headers function learns the call's credentials.** `ApiClientSettings.headers` becomes
`(request: { credentials?: RequestCredentials }) => ...`. `toConfiguredApiClient` adds the configured headers in its
`fetch` wrapper, where the per-call `init` is visible, instead of Hono's argument-less `headers` option, and `fetchApi`
passes `init.credentials`. The app's `apiRequestSettings` returns the device headers without the cookie when the call
asked for `"omit"`, which the counts client already does for a public read, so a signed-in app reads public counts
from the edge cache. The web sets no headers function and is unchanged. A test in `apiRequestSettings.test.ts` covers
both modes.

**6. Visitor prompts carry a `cta` and remember the page.** `SIGNUP_PROMPTS` and the `cta` type move to
`packages/core/lib/signupPrompts.ts`; the web's `toSignupNavigation` and `toSignupHref` stay in the web and import it.
The app gets `openSignupPrompt(cta, pathname)` in `sessionReturnPath.ts`, which remembers the page and pushes
`/sign-up?cta=…`, and the sign-up screen shows the prompt line in the session column, the native stand-in for the
web's toast on arrival. The return path survives sign-in and sign-up alike because the root layout consumes it when
the session arrives in this process, so the sign-up screen's "Log in" footer carries nothing. A restart drops it, as a
closed browser tab drops `?next=`. The visitor hero renders in the app's `Header` when `isHome` and there is no
session, with the web's headline, `CARL_PITCH` in a sheet from the pitch button as the phone-width web shows it in a popup, the
`carl-hero.png` asset copied into `apps/mobile/assets/`, the call to action, and the tutorial button reporting the
`hero` opener. The headline's shimmer uses the existing `ShimmerText` and stops under reduced motion. `plans` moves to
the public guard. The chat launcher mounts for a visitor and opens the web's `NoConversationPanel` sign-up prompt. A
visitor's deep link to a signed-in route goes through `app/+native-intent.ts`: no session cookie means the path is
remembered and `/sign-in` opens, the app's form of the web's `/login?next=`.

**7. The invite route is the web page on the native stack.** `app/invite/[token].tsx` sits in the public guard so a
visitor's deep link reaches it. Without a session it remembers `/invite/<token>` and pushes sign-in. With one it calls
`sendAcceptInvite(token)` once behind a latch, shows "Carl is checking your invitation…", offers a retry on a thrown
request, shows the rejection heading from `packages/core/lib/inviteRejections.ts` with the web's follow-up lines, and
replaces the route with the Topic or Team on `joined`, `joinedTeam`, or `requestedTeam`.
`activityClient.sendAcceptInvite` parses `inviteAcceptResponse` so the tables stop typing the result by hand. The
`carlnotes://invite/<token>` form works through Expo Router's default scheme linking, and the share and email links
keep their `https` form until Prompt 51 verifies the domain.

**8. GitHub through the browser flow, in the web's order.** `sign-in.tsx` adds `"github"` to its provider union and a
third `OAuthButton` between Google and Apple, calling the same `handleBrowserSignIn`. The icon comes from
`simple-icons`' `siGithub` through the app's `BrandIcon`, as the web's `BrandIcon` does, so `OAuthProviderIcons.tsx`
exports `GithubIcon` on both apps from the same source.

**9. System appearance is a third stored state.** `setThemePreference` accepts `ThemePreference`; `"system"` removes
the stored key and applies `"auto"`. `theme.ts` exposes `useThemePreference()` over `toStoreListeners`, and `ThemeMenu`
keeps the Light mode and Dark mode toggle and adds a "System appearance" item below it while a palette is saved. It
sits in the hamburger's first slot, where the web's small-screen hamburger keeps its toggle, so the only addition is
the way back, which the device's own appearance switch justifies.

**10. The client parity check walks reachable named imports.** `scripts/clientParity.ts` parses each source file's
imports with their specifier names, resolves `./`, `../`, `@/` (to `<app>/src`), and `@carlnotes/<pkg>/<path>` (to
`packages/<pkg>/<path>` with `.ts`, `.tsx`, and `/index.ts`), and walks from each app's route files,
`apps/web/src/routes` and `apps/mobile/app`, skipping tests and stories. A capability is an exported function of a
`packages/client/*Client.ts` module. An app reaches a capability when any reachable module names it in an import, so a
core hook that calls a client function counts for the app that reaches the hook. `check-client-parity.ts` fails on a
capability the web reaches and the app does not, unless the "Web-only client capabilities" table in
`apps/mobile/parity.md` lists it with a reason or its prompt, and fails on a listed capability the app now reaches or
that no longer exists. The runner prints the mobile-only capabilities as information. `preflight.sh` gains the line
after the component parity check.
*Alternative:* counting an app's direct imports of each client module. Rejected: it misses a call through a core hook
and cannot tell a reached function from a reached file.
*Alternative:* failing on core modules reachable from one app. Rejected: many core modules are platform-specific by
design, and the policy would duplicate the AGENTS.md reuse rules in a noisier form.

**11. One reviewed inventory file.** `apps/mobile/parity.md` holds the web-only capability table the check reads, the
page and action inventory with each web-only item's reason or prompt, and the role matrix from the permission pass
with every role left untested named. `apps/mobile/AGENTS.md` links to it instead of growing another section.

## Risks / Trade-offs

- [The web badge poll stops while a tab is hidden] → That is the stated rule, no background requests. The panel still
  reloads rooms when a menu or a room opens, and the existing web tests keep their assertions.
- [A mobile view may never reach the counter: `POST /topics/:id/view` needs `Sec-Fetch-Site: same-origin` or an
  `Origin` equal to the app url, and the app sends neither] → Confirm against the dev api first. If the view is
  dropped, `isSameOriginRequest` also accepts a request with the app's platform header. A non-browser caller can forge
  `Origin` today, so the widening adds no new exposure, and the 30-a-minute sender limit stays.
- [Hono's `headers` option is replaced by a fetch wrapper] → The wrapper keeps the same merge rule, configured headers
  under the call's own, and `packages/client`'s tests cover it.
- [The in-memory return path is lost on a cold start] → The invite route and every prompt re-derive from the url on
  the next open, and the web drops `?next=` the same way when a tab closes.
- [Expo Router's protected fallback and `+native-intent` disagree on a deep link] → The intent hook runs first and
  only rewrites a visitor's path to `/sign-in`, so the guards never see a protected path without a session.
- [The parity walker resolves an import wrong and reports a false gap] → The test fixtures cover each specifier form,
  and a false gap fails loudly with the capability and the web module that reaches it, never silently.
- [Memory on the development machine] → Device checks run on the Android emulator only when a Storybook story or a
  `bun test` cannot prove the state, and one emulator at a time.
