## Context

The badge machinery exists: `chatRoomStore` and `noteBadgeStore` hold what the poll last read, `AppChatPanel` polls every 45 seconds while a user is signed in, `UserMenu` shows a `CountBadge` per row with a label for the trigger, and `usePageTitle` leads the tab title with the sum. The Activity page already computes the pending topic invitations in `loadInvitedTopicSubscriptions` in `api/activity.ts`, which is what the "Invited" rows are.

## Goals / Non-Goals

- Goal: a user learns of a waiting topic invitation from any page, and knows who sent it and for what, without opening the Activity page.
- Goal: the badge and the Activity page agree, always.
- Non-goal: team invitations, which the Teams page shows and which keep their own treatment.
- Non-goal: accepting or declining from the tooltip. The Activity page does that.

## Decisions

- **One query, two readers.** `loadInvitedTopicSubscriptions` is exported and the new route maps its rows to `TopicInviteBadge`, so the badge cannot count an invitation the page does not show. An invitation the user deleted, declined, or accepted leaves both at once.
- **A store of its own.** `topicInviteStore` holds the list the poll last read, in the shape of the note badge store, instead of widening that store to a second kind of thing.
- **Three refresh points.** The badge poll reads it with the other badges, and the subscriptions table re-reads it after an accept or a decline, so the count drops the moment the user answers instead of at the next poll.
- **Bullets, not lines.** The tooltip lists invitations as a bulleted list, since each is one complete sentence about one person and one topic. The chat and note tooltips take the same shape, a heading over bullets, through one shared section, and every name in a bullet, a user, a topic, a team, or a note, is bold.
- **One badge everywhere.** The header avatar and the mobile menu button show one count summing chats, notes, and invitations instead of a pill per kind, and every other badge sums its own groups the same way, the menu rows, the profile page's avatar, the Teams title, and every topic or team name, through one `UpdateCountBadge` whose tooltip stacks the groups under their headings. The outline pill is gone, so `CountBadge` has one filled style, and a name's badge opens the chat while a chat mention waits, else the notes' page.
- **The Activity title too.** The Activity page's own title shows the invitation badge on the user's own view, the way a topic's title shows its chat and note badges.

## Risks / Trade-offs

- The poll adds one small request every 45 seconds per signed-in user, the same cost as the note badges.
