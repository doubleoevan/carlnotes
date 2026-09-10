## ADDED Requirements

### Requirement: A waiting topic invitation shows as a badge on the Activity row, the Activity title, the avatar, and the tab title
The user menu's Activity row and the Activity page's own title SHALL show a count of the topic invitations waiting for the signed-in user's answer, and the tab title's leading unread count SHALL include them beside the unread chats and notes. Every badge SHALL be one count in one filled style, never two pills side by side: the header's avatar and the mobile menu button sum the unread chats, the unread notes, and the waiting invitations, the Profile row and the profile page's avatar sum the topics' chats and notes, the Teams row and the Teams title sum the teams' own, a topic or team name's badge sums that page's chats and notes, and each badge's tooltip SHALL list its groups under their own headings, chats, then notes, then invitations, as bullets. A page name's badge SHALL open the chat while a chat mention waits, else the notes' page. Every badge tooltip SHALL bold the names it holds, a user, a topic, a team, or a note. The count SHALL come from the same query the Activity page's "Invited" rows come from, through `GET /api/invites/topics/pending`, so the badge and the page always agree. The badge's tooltip SHALL list the invitations as bullets reading "{user} invited you to subscribe to {topic}", the first four in full and the rest as a count. The badge SHALL be read with the other badges on their poll and again the moment the user accepts or declines an invitation on the Activity page.

#### Scenario: An invitation arrives while the user is elsewhere
- **WHEN** a user with no waiting invitation is invited to a topic and the badge poll next runs
- **THEN** the Activity row and the Activity title show a count of 1, the avatar badge and the tab title's leading count rise by 1, and the tooltip reads "{inviter} invited you to subscribe to {topic}" with both names bold

#### Scenario: Answering the invitation clears it
- **WHEN** the user accepts or declines that invitation on the Activity page
- **THEN** the count drops before the next poll, and the avatar badge and the tab title's count drop with it

#### Scenario: A visitor has no badge
- **WHEN** a request for the waiting invitations arrives with no session
- **THEN** it is rejected with 401 and no badge shows
