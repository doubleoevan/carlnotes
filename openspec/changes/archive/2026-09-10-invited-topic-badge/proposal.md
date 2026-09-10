## Why

A topic invitation waits on the Activity page as an "Invited" row, and nothing else in the app says it is there. A user who is not on that page never learns someone invited them until they happen to open it. Chat mentions and note changes already reach the user through the menu badges and the tab title, so an invitation should too.

## What Changes

- **A topic invitation badge.** The Activity row of the user menu and the Activity page's title show a count of the topic invitations waiting for the user's answer, and the tab title's leading count includes them beside the chats and notes.
- **One badge everywhere.** The header avatar shows one count summing the unread chats, notes, and invitations, each menu row, page name, and page avatar one count summing its own, in one filled style, and every badge's tooltip lists its groups under their own headings. Every badge tooltip bolds the names it holds.
- **A tooltip that names each one.** The badge's tooltip lists one bullet per invitation, "{user} invited you to subscribe to {topic}", the first four in full and the rest as a count, the way the note badge tooltip does.
- **A badge route.** `GET /api/invites/topics/pending` returns the waiting invitations through the same query the Activity page's "Invited" rows come from, so the badge and the page never disagree. The badge poll that reads chat mentions and note badges reads it too, and answering an invitation on the Activity page refreshes it at once.

## Capabilities

### Modified Capabilities

- `activity-page`: the Activity row and the tab title carry a count of the topic invitations waiting for an answer, with a tooltip naming each.
