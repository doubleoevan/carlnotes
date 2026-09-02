## Why

A team leader copied a link from the team's share sheet, texted it, and the recipient could not join.
It happened twice in a day, to two different teams, and neither time did anything malfunction.

Both halves of the flow point away from the invitation. A team page URL previews as a card with the
team's name and avatar, because `/teams/:id` injects preview tags. An invite URL previews as the
generic site title, because `/invite/:token` has no route at all. So the link that grants nothing looks
like an invitation, and the link that grants everything looks like a stray URL.

The share sheet then makes the same suggestion. Five of its six send options share the team page.
Only **Invite** mints a token, and it is the one option that hides itself when the browser has no
native share sheet.

## What Changes

- **An invite link previews as what it opens.** `/invite/:token` SHALL serve the preview card of the
Team or Topic the token opens, the same card that path's own page serves.
- **Unfurling never spends an invite.** The preview is a read. Acceptance stays a signed-in POST.
- **A dead token previews as nothing.** Revoked, expired, exhausted, and unknown tokens SHALL fall
through to the site's own tags instead of advertising something nobody can join.
- **The share sheet says which link is which.** The option that copies the page SHALL name the page,
and the option that mints an invitation SHALL name the invitation.
- **Invite stops depending on the native share sheet.** It SHALL be offered to anyone who may invite,
falling back to the clipboard, so the only option that grants access never disappears.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `invite-links`: an invite URL carries the preview card of what it opens, and a dead token carries none.
- `invite-share-sheet`: the sheet distinguishes sharing the page from inviting, and always offers to invite.

## Impact

- **Modified**: `api/pages.ts` for the `/invite/:token` route, `ui/src/components/share/ShareTeam.tsx`
and `ShareTopic` for the labels and the fallback.
- **Reused**: `toTeamPreview` / `toTeamPreviewHtml` and the topic equivalents, unchanged, and
`toInviteRefusal` for deciding a token is dead.
- **Unchanged**: acceptance, the token lifecycle, and who may create an invite.
