## Context

The invite link change adds an invite token to `topic_invites` and an `/invite/:token` route that accepts it, and it hands that token out from the share menu through url builders: `mailto:`, `sms:`, and the web intents of the platforms that publish one.

That set is bounded by what the web can address, and the boundary sits in the wrong place. Instagram publishes no share url and no direct-message intent. WeChat's sharing needs a verified Official Account and only fires inside WeChat's own browser. Discord, Slack, Signal, and Snapchat publish nothing a link builder can target. These are the applications an invite would actually travel through, and no amount of buttons reaches them.

The operating system already holds the list. Every installed application that registered a share target appears in the sheet `navigator.share` opens, on iOS Safari, on Android Chrome, and on desktop Safari and Edge and Windows Chrome. One call reaches all of them, and the list stays current without us maintaining it.

The public topic share is a separate action that has its own reason to open a sheet, and it hands out a Topic's public url. This change makes it the second caller of one helper instead of the second place the same three lines are written.

## Goals / Non-Goals

**Goals:**
- An invite can leave the share menu through any messaging application the person has installed.
- The row appears on mobile only, and the copy row already in the menu covers everywhere else.
- One token is created per share, and none is created by rendering or opening the menu.
- One helper makes the sheet call for both the invite share and the public topic share.
- The invite handed to the sheet has the same limits, expiry, and revocability as one handed to a provider row.

**Non-Goals:**
- Attribution. The sheet reports no destination and no recipient, and nothing here invents one.
- Replacing the provider rows or the copy row. The sheet is one more row beside them.
- Sharing a file, an image, or a generated card. The payload is a title, a short text, and a url.
- A polyfill, a sheet-shaped modal, or a per-platform grid standing in for the sheet where the API is absent. The fallback is the copy row that already exists.
- Any change to the token itself, its limits, its expiry, or its revoke control.

## Decisions

### The create is awaited inside the click handler, and a rejected gesture falls back to copy

`navigator.share` requires user activation, and creating the token before the call spends part of that activation window on a network round-trip. WebKit is the strict implementation here and has historically rejected a share call that did not run inside the gesture itself, with `NotAllowedError`.

The alternative is creating the token ahead of the tap, so the click handler has one in hand and calls the sheet with no await at all. It was rejected: creating on mount or on hover writes a live bearer token for a person who may never share, and the only honest trigger is a share. The menu would issue tokens by being opened.

So the token is created inside the handler, and the rejection is handled instead of prevented. A `NotAllowedError` takes the same exit as a missing API: the invite URL goes to the clipboard and the row says the link was copied. The fallback costs nothing extra, because feature detection already needs it, and the person gets a working link either way instead of a row that appears to do nothing.

`AbortError` is not that case. It is what the sheet throws when the person dismisses it, which is a completed interaction with a decision in it, and it resolves quietly with no copy and no error surfaced.

### One helper, two callers, two labels

The helper takes a title, a text, and a url, feature-detects `navigator.share`, calls it, and answers which of three things happened: the sheet opened and the person picked something, the person dismissed it, or the browser rejected it. Nothing about invites, Topics, or tokens lives in it. Both callers own their own payload and their own fallback.

The two actions stay separate in the UI. The public topic share broadcasts a url anyone can already open. The invite share hands over a credential that grants access to a Topic that is not public. Reading them as one row would let a person broadcast an access token believing they posted a link, so they have different labels and are never merged into one "Share" row.

### The sheet is a dead end for analytics, by design

`navigator.share` resolves with `undefined`. It reports no destination, no application identifier, and no recipient, and it resolves identically whether the person sent the invite to one friend or to a group of forty. There is no callback and no event to subscribe to.

Two events are logged, and neither is a destination: the token was created, and the sheet was opened. The acceptance route is where a real signal exists, because a accepted token names a Topic, a token, and the account that accepted it. Any question of the form "which application did invites come from" is unanswerable and must not be built on top of the sheet event, which counts openings and nothing else.

### The token keeps the protections it already has

A token handed to the sheet can end up in a group chat, a screenshot, or a public post. So can one pasted from the copy row, which is why the invite link change already limits `max_uses`, sets an expiry, and offers a revoke control. Those are exactly the right protections for this path, and they are inherited unchanged.

A separate looser token kind for the sheet was considered and rejected outright. The sheet is the path most likely to end up somewhere unintended, so it is the last path that should get a weaker credential. One token kind also means the revoke control keeps covering every route a token left by.

### A row in the share menu, on mobile only

The sheet is a menu row, not a control of its own. The share menu is already where a Topic is handed to somewhere else, it already holds the copy row an invitee opens, and a second control beside it would split one question across two places. The row sits with the other destinations and reads as one more of them, which is what it is.

It renders on mobile only, gated on `navigator.share` being present and on a coarse pointer. Feature detection alone would put the row on desktop Safari and Windows Chrome, where the sheet does open but lists a printer and a mail client instead of the messaging applications this exists for. Mobile is where the installed applications are, and it is where the sheet earns the row.

A disabled row with a tooltip was rejected. The menu disables a row when the reason is a Topic setting the owner can change, and there is nothing a person can do to give their browser a share sheet. Where the row is absent the menu is unchanged, and the copy row in it still hands the invite out.

`navigator.canShare` is not consulted. It exists to test whether a payload is shareable, and it matters for files. A title, a text, and a url are shareable wherever the API exists at all.

## Risks / Trade-offs

- **A rejected gesture silently becomes a copy, and the person expected a sheet.** → The row says what it did. It reads as copied, not as shared, so nothing claims a share that did not happen.
- **A token is created and then the person dismisses the sheet, leaving a pending unused invite.** → It expires and it counts against `max_uses` only when accepted, so an abandoned create costs an unaccepted row. Creating after the dismissal is impossible, since the payload has to exist before the sheet opens.
- **Repeated shares create repeated tokens for the same Topic.** → That is the intent. Each share is a separate handout, and one token per share is what makes the revoke control granular. The guard is that rendering never creates.
- **Someone later reads the sheet-opened count as a share count per platform.** → The spec says the sheet returns no destination, and the event has no destination field for anyone to misread.
- **Desktop gets no row at all, including the desktop browsers that do have the API.** → They get the menu they have today, whose copy row is what a desktop user reaches for anyway, and they are not where the closed messaging applications are installed.
- **The public topic share adopting the helper changes a shipped surface.** → The helper is a move of the same call, and the topic share's payload, label, and placement are unchanged by this change.

## Migration Plan

No schema, no migration, no backfill. The change is additive UI over the invite link change's existing create route, and rolling it back is removing the control. Nothing else reads the helper's answer.

## Open Questions

- Whether the sheet's text should name the Topic's owner as well as the Topic. It is one string and can be settled while the control is being built.
