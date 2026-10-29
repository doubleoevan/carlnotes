# Tasks

## 1. Shared pieces move into core

- [x] 1.1 Move the update count composition into `packages/core/components/UpdateCountBadge.tsx` with injected
      elements (count badge, link, status wrapper, label, explanation): the sum, `toUpdateLabel`, the tooltip sections
      with headings and "and N more", and the menu trigger and page variants. Make
      `apps/web/src/components/common/UpdateCountBadge.tsx` the web adapter. Verify: the web's existing badge tests and
      Storybook stories pass unchanged, and `bun test packages/core` covers the sum and the label text.
- [x] 1.2 Add `packages/core/hooks/useUpdateBadges.ts`: a 45-second poll of the chat mention count and the pending topic
      invitations gated on `focusManager` and `onlineManager`, refreshing on focus and reconnect, one request per source
      in flight, responses guarded by the current account and a request version, the rooms reloaded into
      `chatRoomStore` when the count changes, and the invite store cleared on account change. Verify: a test with fake
      timers shows no request while unfocused, one request per tick, a dropped response after the account changes, and
      a room reload only when the count changes.
- [x] 1.3 Replace `usePollBadges` in `apps/web/src/components/chat/AppChatPanel.tsx` with `useUpdateBadges`, and fix its
      comment that claimed it polled note badges. Verify: `bun test apps/web` passes and the panel's menu and room
      opens still reload rooms.
- [x] 1.4 Move `SIGNUP_PROMPTS` and its `cta` type to `packages/core/lib/signupPrompts.ts` and the invite rejection copy
      to `packages/core/lib/inviteRejections.ts`; the web's `signupPrompts.ts`, `SignupPage`, `InvitePage`, and
      `inviteRejections.test.ts` import them. Verify: the web tests pass and `bun scripts/check-package-boundaries.ts`
      is green.
- [x] 1.5 Make `packages/client/activityClient.ts`'s `sendAcceptInvite` parse `inviteAcceptResponse`, and drop the
      hand-typed result in both apps' subscription and membership tables. Verify: `bunx tsc -b` passes with no local
      result type left.

## 2. Public count reads leave the cookie off, and a view counts

- [x] 2.1 Change `ApiClientSettings.headers` to take `{ credentials }`, add the configured headers in
      `toConfiguredApiClient`'s fetch wrapper where the call's `init` is visible, and pass `init.credentials` from
      `fetchApi`. Verify: `bun test packages/client` covers configured headers under the call's own in both paths.
- [x] 2.2 Make `apps/mobile/src/apiRequestSettings.ts` return the device headers without `cookie` when the call asked
      for `credentials: "omit"`. Verify: `apiRequestSettings.test.ts` asserts the cookie is present by default and
      absent for an omitted call, and a dev api log shows `CDN-Cache-Control: max-age=30` on a signed-in app's public
      counts read.
- [x] 2.3 Confirm against the dev api that a Topic view sent from the app increments the viewer count. If
      `isSameOriginRequest` drops it, accept a request that sends the app's platform header, with a test in
      `apps/api/sameOrigin.test.ts` for a browser without the header and an app with it. Verify: the dev api's count
      rises by one after one app open.

## 3. Native badges and counts on the web's placements

- [x] 3.1 Add `apps/mobile/src/components/common/CountBadge.tsx` on the Nightshift Badge primitive and
      `common/UpdateCountBadge.tsx` as the core composition's native adapter: the accessible label is the web's screen
      reader text, a long press opens a `Sheet` listing the sections under their headings with bold names, and the page
      badge's press maps `/topics/:id?chat=teamId` through `chatNavigation.ts`. Verify: stories for a chat-only, a
      notes-only, an invitation-only, a mixed, and a "9+" badge, each naming its web story.
- [x] 3.2 Mount `useUpdateBadges` once in the app's `AppChatPanel`, pass `renderBadge` from `layout/UserMenu.tsx`, put
      `MenuTriggerUpdateCountBadge` on the hamburger, and read the chat rooms from `chatRoomStore` in `ChatScreen`
      instead of its own query. Verify: with a mention and an invitation waiting on the dev api, the menu button shows
      the sum, the Activity item shows 1, and the Profile or Teams item shows the mention.
- [x] 3.3 Place the badges on the chat launcher pill (`ChatPanelWidget`), the room menu trigger and each room
      (`ChatOptionsMenu`, `ChatScreen`), the Topic header (`TopicPageContent`), the Feed's Topic cards (`Topic.tsx`),
      the Team header, the Team membership rows, and the Activity title. Verify: each placement's story shows the badge
      at the web's position, and opening the room on the dev api drops every badge that counted it.
- [x] 3.4 Add `apps/mobile/src/hooks/usePolledCounts.ts` from the Topic counts line's query, with the fetch `signal`
      passed and a failed read that throws, and use it for both counts lines so the Podcast Episode screen polls every
      60 seconds while on its route. Verify: a test of the query options asserts the interval, the route gate, and the
      thrown failure, and a dev api log shows one listener read a minute from an open episode screen and none while
      backgrounded.

- [x] 3.5 Add `expo-notifications` and `apps/mobile/src/appIconBadge.ts`: the app icon badged with the summed update
      count from the shared stores, cleared for a visitor and on sign-out, the iOS badge permission asked once when a
      signed-in user first has a count with alerts and sounds off. Verify: `tsc -b` and the gate pass with the module
      installed. The icon count on a device is in the follow-up, since the native module needs a rebuilt development
      client.

## 4. Visitor access

- [x] 4.1 Move `plans` into the public guard in `app/_layout.tsx`, and send each plan's action to sign-up for a visitor
      as the web does. Verify: Plans opens with no session on the dev build, and the recommended plan is highlighted.
- [x] 4.2 Add `openSignupPrompt(cta, pathname)` to `sessionReturnPath.ts`, pass the `cta` to `sign-up.tsx`, show the
      prompt in the session column, and keep the `cta` on the sign-up screen's Log in link. Replace every bare
      `router.push("/sign-up")` (Topic follow and Brew controls, New topic, Team up, Join team, the episode gate) with
      it, prompt a visitor's Add Note instead of hiding it, and give the invite-only Topic gate the web's Log in and
      Sign up. Verify: a test of `openSignupPrompt` covers the remembered path and the route, and on the dev build
      pressing Follow as a visitor opens sign-up reading "Sign up to follow this topic" and returns to the Topic after
      sign-in.
- [x] 4.3 Render the visitor hero in `layout/Header.tsx` when `isHome` and there is no session: the headline on
      `ShimmerText`, `carl-hero.png` copied into `apps/mobile/assets/`, the call to action and tagline, the pitch in a
      sheet from its button, and the tutorial button with the `hero` opener; add `hero` to the mobile openers in
      `topicTutorialVideo.ts` if the web's name is not reused. Verify: a Header story for the visitor hero in light and
      dark and under reduced motion, compared with carlnotes.com at 375 pixels.
- [x] 4.4 Mount the chat launcher for a visitor with the web's `NoConversationPanel` sign-up prompt, and add
      `app/+native-intent.ts` so a visitor's link to a signed-in route remembers it and opens `/sign-in`. Move the web's
      Teams index route under `_signedIn`. Verify: a test of the intent hook covers a visitor's and a user's path, the
      launcher story shows the sign-up panel, and the web's `/teams` redirects a visitor to `/login?next=/teams`.

## 5. The invite route

- [x] 5.1 Add `app/invite/[token].tsx` in the public guard: a visitor remembers `/invite/<token>` and goes to sign-in, a
      user accepts once behind a latch, the checking line, the retry on a thrown request, the rejection headings from
      core with the web's follow-up lines, and `router.replace` to the Topic or Team on `joined`, `joinedTeam`, or
      `requestedTeam`. Verify: stories for checking, failed, each rejection, and team full. The
      `carlnotes://invite/<token>` open on a device is in the follow-up.
- [x] 5.2 Document the native invite link in `apps/mobile/AGENTS.md` and the docs' sharing page, naming the `https`
      form as Prompt 51's. Verify: the docs build and the AGENTS.md path check pass.

## 6. GitHub sign-in and system appearance

- [x] 6.1 Export `GithubIcon` from the app's `OAuthProviderIcons.tsx` from the same `simple-icons` path the web
      draws, and add **Continue with GitHub** between Google and Apple in `sign-in.tsx` through `handleBrowserSignIn`.
      Verify: `tsc -b` and the gate pass. The GitHub sign-in's browser round trip on a device is in the follow-up.
- [x] 6.2 Let `setThemePreference` take `ThemePreference`, remove the stored key for `"system"`, expose
      `useThemePreference()`, and add "System appearance" to `ThemeMenu` while a palette is saved. Verify: a `theme.ts`
      test covers save, clear, and restore, and the menu story shows the item only with a saved palette.
- [x] 6.3 Update `apps/mobile/AGENTS.md`'s Sign-in and appearance lines, the docs' sign-in page, and the appearance
      note. Verify: the docs name GitHub and the way back to the system appearance.

## 7. The client parity check

- [x] 7.1 Write `scripts/clientParity.ts`: parse imports with their specifier names, resolve `./`, `../`, `@/`, and
      `@carlnotes/<pkg>/<path>` with extension and index tries, walk from each app's route files skipping tests and
      stories, collect the exported functions of `packages/client/*Client.ts`, and compute each app's reached
      capabilities. Verify: `scripts/clientParity.test.ts` covers each specifier form, a capability reached through a
      core hook, a reached file whose other export is not reached, and the mobile-only report.
- [x] 7.2 Write `apps/mobile/parity.md` with the "Web-only client capabilities" table (capability, status, reason or
      prompt), seeded from the first run of the check: Admin, hosted checkout and billing (Prompt 55), voice chat,
      attachments and new-topic chat, podcast questions, push, and the document title count, each with its prompt or
      reason. Verify: every row has a reason, and the check reads the table.
- [x] 7.3 Write `scripts/check-client-parity.ts`: fail on an unlisted web-only capability, a listed capability the app
      now reaches, a listed capability that no longer exists, and a row without a reason; print the mobile-only
      capabilities. Add the line to `scripts/preflight.sh` after the component parity check, name the check in the
      README's Development section and the root AGENTS.md verification line, and link `parity.md` from
      `apps/mobile/AGENTS.md`. Verify: `bash scripts/preflight.sh` runs it green, and removing one inventory row makes
      it fail with the capability and the web module named.

## 8. Permission pass, documentation, and the gate

- [x] 8.1 Lay out the role matrix in `apps/mobile/parity.md`: each account, Team, and Topic action against owner,
      member and editor, read-only follower, leader, and admin, every cell reading `not yet verified` until the pass
      runs on the rebuilt development client. Verify: the matrix lists each action with its roles, and the pass is in
      the follow-up.
- [x] 8.2 Write the page and action inventory in `apps/mobile/parity.md`, distinguishing component reuse, shared logic
      with a native renderer, and native replacements, and state in `apps/mobile/AGENTS.md` the requests a signed-in,
      focused Topic screen sends per minute and which polls send them. Verify: the figure matches a dev api log of one
      focused minute.
- [x] 8.3 List each new state's story and its web reference in `parity.md`'s rendered comparisons table: the badges,
      the hero, the prompts, the invite screen, the sign-in buttons, and the menu's appearance items. Verify: the table
      names each state's story, and the device comparison in light, dark, and large text is in the follow-up.
- [x] 8.4 Run `bun run check` green, with the web's existing regression assertions unchanged. Verify: preflight prints
      "preflight green" with the client parity check in its output.

## Workflow follow-up

- Ship through /ship, archive with `openspec archive mobile-access-and-parity --yes`, and tick the Prompt queue row 49
  after the deploy.
- Rebuild the development client, since `expo-notifications` is a native module, then on the Android regression pass:
  the app icon's count after a mention and its clearing on sign-out, `carlnotes://invite/<token>` for a user and for a
  visitor who signs in, the GitHub sign-in round trip, the role matrix in `apps/mobile/parity.md`, and each state in
  its rendered comparisons table in light, dark, and large text. Record each result in `parity.md`.
