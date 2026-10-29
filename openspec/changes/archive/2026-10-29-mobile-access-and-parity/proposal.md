## Why

The mobile app's pages, tables, chat, notes, and podcast player have shipped, and the gaps left are the ones a person
hits between pages: no mention or invitation badge anywhere in the app, an invite link that opens the web, a GitHub
button missing from sign-in, a sign-up push that loses the page the visitor was reading, and no way back to the
device's appearance once a palette is chosen. Nothing in preflight notices when the web gains an api capability the
app cannot reach, so each of these gaps was found by hand. This change closes the gaps around the shipped pages
without rebuilding them, and adds the check that keeps new ones from opening.

The audit before this proposal found the app already open to visitors: Home, Search, public Topics with their Findings
and scan recaps, Profiles, Team pages, permitted notes, and public Podcast Episodes render with no session. What a
visitor is missing is the web's hero on Home, the Plans page, the Carl-voiced sign-up prompts, and the return to the
page they came from.

## What Changes

**Counts and badges.** One shared badge poll, in `packages/core`, reads the chat mention count, the room list when it
changes, and the pending topic invitations every 45 seconds while the app is in the foreground and online, with the
account guard `useNoteBadges` already has. The web's `AppChatPanel` uses it in place of its ungated timer. The app
gets the web's summed `UpdateCountBadge` on the same placements: the menu trigger, the Profile, Teams, and Activity
menu items, the chat launcher pill, the room menu trigger and each room in the list, the Topic and Team headers, the
Feed's Topic cards, the Team membership rows, and the Activity title, and the app icon's badge shows the same sum the
web's tab title shows, cleared for a visitor and on sign-out. The Podcast Episode screen polls its listener
count every 60 seconds while on the route, and a failed read keeps the last count as the web does. Public count reads
leave the session cookie off: the api client passes each call's credentials mode to the configured headers, and the
app's headers return no cookie for a call that omits credentials. A mobile view is confirmed to count at the api's
same-origin check, and the check is widened to the app's own headers if it does not. The requests a focused screen
sends per minute are written down.

**Visitor access.** Plans opens to a visitor. A visitor's Home shows the web hero with its headline, pitch, image,
and tutorial video button, above the Featured and Popular sections. Every action that needs an account uses the
web's `SIGNUP_PROMPTS`, moved to `packages/core`, carries its `cta` to the sign-up screen where the prompt shows in
Carl's words, and remembers the page so sign-in or sign-up returns there. That covers the Topic follow and Brew
controls, New topic, Add Note, Team up, Join team, the invite-only Topic gate, and the chat launcher, which a
visitor now sees with the web's "Sign up to begin the conversation" panel. Chat itself stays signed-in only. A visitor
who opens Account, Activity, or Teams is sent to sign-in and returned. The web's visitor Teams page, which today
renders a load failure, moves behind sign-in like Activity and Account.

**Invites.** A native `/invite/[token]` route takes the web's `InvitePage` behavior: a visitor is sent to sign-in
with the invite as the pending destination, a user's acceptance runs once, "Carl is checking your invitation…" shows
while it runs, a failed request offers a retry, the rejection copy moves from the web page to `packages/core` so both
apps say "That invitation went cold", "all poured out", "full to the brim", and "Carl doesn't know that invitation",
and a joined Topic or Team opens with the route replaced. The web token page has no decline step and no separate
already-accepted copy, so the app matches it: an invitation already spent on this account opens its destination, and
declining stays on the Activity and Teams tables, which already accept and decline natively. The `carlnotes://`
scheme opens the route today, so a `carlnotes://invite/<token>` link works from this change. Verified `https` links
and the domain association files stay with Prompt 51. The invitation count shows on the menu trigger and the
Activity item as on the web.

**Account access.** GitHub sign-in joins Google and Apple on the sign-in screen, through the same browser return and
session read, in the web's order. The hamburger keeps its Light mode and Dark mode toggle and gains a "System
appearance" item while a palette is saved, which clears the saved palette and follows the device again. The web has no
system option because a browser offers the system preference only until a choice is saved, and the device's own
appearance switch is the reason the app offers the way back. The account, Team, and Topic actions are exercised as
owner, member, editor, read-only follower, leader, and admin, and every role left unexercised is named in the report.

**Client parity check.** A new preflight check, `scripts/check-client-parity.ts`, walks each app's reachable modules
from its routes through `@/`, relative, and `@carlnotes/*` imports, and lists the `packages/client` capabilities
each app reaches. A capability the web reaches that the app cannot fails the check unless the inventory in
`apps/mobile/parity.md` lists it with a reason or the prompt that owns it, and an entry whose capability the app now
reaches fails until it is retired. The inventory's first entries are the deferred voice, attachment and new-topic
chat, podcast question, push, store payment, and Admin work. The Nightshift component-contract check and the reuse
rules in the AGENTS.md files stay as they are, and the new check adds no second copy of their policy.

No breaking change. The api gains no route. The one api change is the same-origin check for a recorded view, made only
if the audit finds the app's views are dropped.

## Capabilities

### New Capabilities

- `client-parity`: every api capability the web reaches is reachable from the mobile app or listed in a reviewed
  inventory with its reason, checked in preflight from each app's reachable imports.

### Modified Capabilities

- `mobile-feed`: the branded header's menu shows the summed update badge, a visitor's Home shows the web hero, Plans
  opens to a visitor, account actions prompt a visitor in Carl's words and return them after sign-in, and the chat
  launcher shows a visitor the web's sign-up panel.
- `mobile-chat`: mention counts show on the native chat launcher, room menu, room list, and page headers, read by one
  foreground-and-online poll shared with the web.
- `mobile-sign-in`: GitHub joins the sign-in providers, and a visitor who opens an account screen is sent to sign-in
  and returned to it.
- `mobile-app`: the app follows the device appearance until a palette is chosen and offers the way back to it.
- `invite-links`: the app's `/invite/[token]` route accepts a token with the web's states, and a visitor is carried
  through the app's sign-in and back to the invitation.
- `note-badges`: the native header menu and page headers show the summed note counts the web shows.
- `activity-page`: a waiting topic invitation shows as a badge on the app's menu trigger, Activity item, and Activity
  title.
- `viewer-counts`: the app's Podcast Episode screen refreshes its listener count while on the route, and a failed
  refresh keeps the last count.
- `edge-caching`: the app, like the browser, reads a public Topic's or Podcast Episode's counts without credentials.

## Impact

- `packages/core`: the shared badge poll hook and the update count composition, `signupPrompts`, and
  `inviteRejections` move in from `apps/web`; `UserMenuItems` gains nothing, since `renderBadge` already exists.
- `packages/client`: the request settings pass each call's credentials mode to the headers function, and
  `activityClient`'s accept parses the `inviteAcceptResponse` contract.
- `apps/web`: `AppChatPanel`, `signupPrompts`, `InvitePage`, and `inviteRejections` import the shared pieces; the
  Teams index route moves under `_signedIn`. Its tests and regression assertions keep passing.
- `apps/mobile`: `common/UpdateCountBadge.tsx`, the badge wiring in `layout/UserMenu`, `chat/ChatPanelWidget`,
  `chat/ChatOptionsMenu`, `chat/ChatScreen`, the Topic and Team headers and cards, `app/invite/[token].tsx`,
  `app/plans.tsx` outside the signed-in guard, the Home hero in `layout/Header`, the sign-up prompt and return path
  in every visitor action, `app/sign-in.tsx` and `session/OAuthProviderIcons.tsx` for GitHub, `theme.ts` and the
  `ThemeMenu` for the system option, the episode counts query, `apiRequestSettings.ts` for the cookie opt-out, new
  Storybook stories for each new state, and `AGENTS.md` plus the new `parity.md`.
- `apps/api`: `sameOrigin.ts` only if the view audit requires it.
- `scripts/`: `check-client-parity.ts`, `clientParity.ts`, its test, and the line in `preflight.sh`; the README's
  Development section names the check.
- `apps/docs`: the reading pages name the app's badges, the invite link, GitHub sign-in, and the appearance choice.
- No new dependency and no migration.
