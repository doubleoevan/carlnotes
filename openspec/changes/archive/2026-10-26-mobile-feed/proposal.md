# Proposal

## Why

The mobile home screen proves the stack but cannot read a Topic's Feed. Sharing the web's feed state first lets mobile add reading and Finding actions without maintaining a second set of rules.

## What Changes

- Extract the router-free feed hook, filters, sort, reheat, and Finding handlers into `packages/core`. Keep web loader hydration and pathname handling in its provider.
- Add mobile Home and Settings tabs, a Topic screen, and the web's compact branded header with the Topic tutorial video.
- Render the Yours, Subscribed, Featured, and Popular sections with FlashList and compact Finding rows inside one raised card per Topic. Tapping a row opens its details, preview, and permitted actions in a bottom sheet. The notebook tile beside the Topic title opens its Topic roast sheet.
- Apply optimistic changes through shared handlers, with reliable failure reporting, rollback, and reconciliation. Preserve the web's existing presentation and action behavior.
- Persist the signed-in user's feed and visible Topic queries with TanStack Query and AsyncStorage. Clear them on sign out, account deletion, and identity changes; invalidate older builds' caches.
- Establish `carlnotes.com` at a 375-pixel viewport as mobile's visual and copy reference. Document the named iOS and Android conventions that replace web interactions.
- Add matching mobile stories, shared-state and persistence tests, and the affected module documentation.

The parity pass includes native site search, tag and Resource-kind filters, the header menu, Topic page cards, and a sharing menu. New Topic, editing, team management, brewing, reporting, and Tasting Note workflows have visible placeholders with explicit web handoffs. A native editor, audio player, and standalone Finding screen remain outside scope.

## Capabilities

### New Capabilities

- `topic-feed-state`: One universal feed-state hook, shared selectors and Finding handlers, platform adapters, and web compatibility.
- `mobile-feed`: Mobile feed sections, Topic reading, Finding cards and actions, tutorial playback, and account-bound offline query persistence.

### Modified Capabilities

- `mobile-app`: Replace the demonstration home requirement and establish durable web parity, native exceptions, accessibility, and story references.
- `mobile-sign-in`: Guard the new navigation, locate account identity in Settings, clear feed caches on session exit, and distinguish authentication forms from the authenticated header.
- `finding-bookmarks`: Preserve bookmark ordering and permissions with controls in the Finding details sheet and a bottom-sheet filter.

## Impact

The implementation touches `apps/mobile`, portable React components and hooks in `packages/core`, Topic and Finding clients in `packages/client`, and shared fixtures and text tests in `packages/contracts`.
Web adapters use the same components for pagination, scan notes, Source results, Finding lists, metadata, ratings, and Notes tables. Nightshift owns their shared pagination colors.
The affected `AGENTS.md` files document these responsibilities and require future changes to reuse shared components and verify web parity.

Core gains the existing TanStack Query dependency. Mobile gains FlashList, Expo Image, Expo Clipboard, TanStack Query persistence packages, and an embedded YouTube player with its Expo-compatible WebView. Existing AsyncStorage, bottom-sheet, browser, navigation, analytics, and Nightshift implementations are reused.

The existing API routes, authorization rules, and database schema remain sufficient. The client needs an opt-in rejected-write result so shared mutations can roll back; existing callers retain their default behavior.
