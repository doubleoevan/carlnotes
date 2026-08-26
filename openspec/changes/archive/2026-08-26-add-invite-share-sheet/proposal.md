## Why

The invite link change hands an invite out through link builders: a copy row and a handful of per-platform urls. The messaging apps people actually reach for are closed to that approach. Instagram publishes no share url and no direct-message intent, WeChat needs a verified Official Account and only works inside its own browser, and Discord, Slack, Signal, and Snapchat expose nothing at all. Every one of them appears in the operating system's share sheet the moment it is installed, so the sheet is not a nicer way to reach those apps, it is the only way, and it costs one API call.

## What Changes

- The share menu gains one more row, which opens the operating system's share sheet with the Topic's name and an invite URL for a freshly created invite token, the same token the provider rows hand out. It is a row among the rows, not a control of its own.
- The row renders on mobile only. Where the sheet is not there to open, the menu is exactly what it is today — the copy row copies the Topic's page url, and no invite link is handed out there.
- The token is created inside the click handler, once per share instead of once per render. A token that arrives too late for the browser's user-gesture window falls back to copying the invite URL.
- A shared helper makes the sheet call for both callers: the public topic share, which broadcasts a Topic's own url, and this one, which hands out a bearer token. They stay separate rows with separate labels, since one publishes and one grants access.
- Nothing is logged as an attribution signal. The one event is `invite_created` with its source, fired when the row creates its token — no sheet-opened or completed-share event exists — so the measure is `invite_created` counts with source "share-sheet" against acceptances, and acceptance stays the only place a real destination is known.

## Capabilities

### New Capabilities
- `invite-share-sheet`: handing an invite token to the operating system's share sheet from the invite section, its feature detection and fallback, when the token is created, its payload, and what it is and is not allowed to claim about where an invite went.

### Modified Capabilities

None. The invite token, its limits, its expiry, and its revoke control are the invite link change's requirements and are inherited unchanged. The public topic share keeps its own requirements in `social-sharing`; this change only moves the sheet call it makes into a helper they share.

## Impact

- `ui/src/lib/shareSheet.ts`: the one helper that feature-detects `navigator.share`, calls it, and reports whether the sheet opened, was dismissed, or was rejected.
- `ui/src/components/topic/ShareTopic.tsx`: the new row, its mobile gate, its create on click, its copy fallback, and the public topic share's own sheet call routed through the same helper.
- No schema, no migration, no new api route beyond the route the invite link change already adds for creating one.
- Depends on the invite link change for the `topic_invite` token and the `/invite/:token` acceptance route. Nothing here can be implemented before it.
