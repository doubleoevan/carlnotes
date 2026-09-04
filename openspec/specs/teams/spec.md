# teams Specification

## Purpose
TBD - created by archiving change add-teams. Update Purpose after archive.
## Requirements
### Requirement: Team pages are id-addressed

A Team's page SHALL live at `/teams/:teamId`, the way a profile lives at `/profiles/:userId`. Teams register no slug: the name changes freely and no url points at it, and usernames keep their own reserved list. A team's name SHALL be unique without regard to case, enforced by a database index, and a taken name is rejected in place at create and rename alike.

#### Scenario: A team page resolves by id

- **WHEN** a Team is created
- **THEN** its page is reachable at `/teams/:teamId` immediately, and renaming the Team changes no URL

### Requirement: A Team holds Topics without owning them

A `teams` table SHALL have id, name, description, avatar key, `is_public` defaulting to false, and created_at. A `team_members` table SHALL have team, user, a role of leader or member, `is_members_visible` defaulting to true, who invited them, and created_at, unique per team and user. `topics` SHALL gain a nullable `team_id` naming the owning team, and a `team_topics` join table SHALL record the additional teams a Topic is shared into.

`topics.owner_id` SHALL remain the creator and continue to fund every Scan. Attachment grants access and places the Topic on the team page; it transfers nothing. A Topic has at most one owning team and any number of teams it is shared into. The owning slot belongs to the Topic owner's own teams alone: attaching an unowned Topic SHALL make the team its owner only when the Topic's owner leads that team, and every other attach SHALL share it in through `team_topics`, so a team the owner does not lead never owns what it added. Only a team that already holds the Topic SHALL reject the attach, with a clear message. A picker offering Topics to attach SHALL leave out only what the target team already holds. Detaching SHALL end whichever holding that team has, and when the owning team lets go, the oldest holding team the Topic's owner leads SHALL take the owning slot, its share row consumed, so an owner's held Topic always has an owning team; with no such team the Topic returns to its creator alone. Attach and detach SHALL both be reversible. Through every attach and detach, `topics.owner_id` and Scan funding never move; the owning-team column is the only thing that moves.

#### Scenario: Only a team that already holds the Topic rejects the attach

- **WHEN** a leader attaches a Topic their team already holds, and another leader attaches the same Topic to a second team
- **THEN** the first request is rejected with a message naming the conflict, and the second shares the Topic into the second team

#### Scenario: Attachment does not move ownership or funding

- **WHEN** a Topic is attached to a Team
- **THEN** its `owner_id` is unchanged and its Scans keep drawing on the creator's plan and budget

#### Scenario: Detach ends one holding

- **WHEN** a leader detaches a Topic
- **THEN** that team's holding ends and the Topic leaves its page, with ownership never having moved, and a member still reached through another holding team keeps their fan-out Subscription

### Requirement: One permission helper resolves an effective role

A single helper SHALL resolve a viewer's effective role on a Topic from the union of its grants — owner when `owner_id` matches, the member's strongest role across the Topic's holding teams — the owning team and every team it is shared into — when the viewer belongs to one, and a direct per-topic grant if one is later added — instead of a boolean from one table. `isAllowed` SHALL stay the one gate; route handlers and query builders SHALL both reach the decision through it and the helper's query fragments, and no inline ownership or visibility comparison SHALL survive outside them.

Capabilities SHALL resolve as: reads for owner and every member; edits for the owner and for the owning team's members while the owner is still on that team, never for a team holding only a share; attach, membership management, and the public toggle for leaders — a leader may attach any Topic they can read except someone else's private one, which stays its owner's alone to hand over; detach for leaders and also for the Topic's owner, who may always pull their own topic back with no team role at all; deletion and Scan triggers for the owner alone, who funds them; and each holding team's room — read, stream, and post — for that team's members alone, so ownership without membership opens no room and a Topic no team holds has none.

An unauthorized read or write of a private or team Topic SHALL answer 404, indistinguishable from a missing id, so existence is not disclosed. The invite-visibility gate — the named answer that walks an invitee through sign-in — keeps its current behavior, because disclosure to the invited is its purpose.

#### Scenario: A member reads and edits, an outsider sees nothing

- **WHEN** a private Topic is held by a Team
- **THEN** every member of the owning team can read and edit it, a team holding only a share reads but never edits, and a non-member's read or write answers 404

#### Scenario: Scans stay the owner's

- **WHEN** a team member who is not the creator triggers a Scan on a team Topic
- **THEN** the request is rejected, since Scans draw on the creator's plan

#### Scenario: Every role and visibility combination resolves

- **WHEN** the helper is asked about each combination of owner, leader, member, and outsider against public, invite, and private Topics
- **THEN** each answers per the capability table, with no path bypassing the helper

### Requirement: A team Topic's history is open to its members

A team member SHALL see a team Topic's full Finding history, like an owner, because the owning team's members edit the Topic. The invite-visibility cutoff — Findings only from Scans after a subscription activated — SHALL continue to govern exactly what it governs today: non-member subscribers of invite-visibility Topics.

#### Scenario: A new member sees the full history

- **WHEN** a user joins a Team holding a Topic with months of Findings
- **THEN** they see the full history, not just Findings from Scans after they joined

### Requirement: Joining a Team writes muted Subscriptions

Joining a Team SHALL write a Subscription per team Topic — active, email muted, frequency copied from the Topic — and attaching a Topic SHALL write the same for every member. A subscription is one row per user and Topic whatever the number of holding teams: a join reuses an existing row through the unique-index upsert, reactivating it and leaving its preferences alone, and never writes a second row. Active rows put team Topics in members' feeds and follower counts through the mechanisms that already read Subscriptions; the muted flag sends no digests at join. A member SHALL be able to unmute delivery per Topic with the existing preference.

Membership and subscription SHALL stay separable: a member who unsubscribes from a team Topic keeps access through the Team, since access comes from membership and delivery from the Subscription. Removing a member SHALL deactivate their Subscriptions on the Team's Topics, and a member keeps their row while any of their teams — the owning team or a shared-into one — still reaches the Topic, so a private team Topic never lingers in a departed member's feed and no still-reached Topic loses its row.

#### Scenario: Joining is quiet but present

- **WHEN** a user joins a Team with twenty Topics
- **THEN** twenty muted Subscriptions are written, no email is sent, the Topics appear in their feed, and each Topic's follower count includes them

#### Scenario: Unsubscribing does not eject

- **WHEN** a member unsubscribes from one team Topic
- **THEN** they keep reading and editing it through the Team, and only delivery stops

#### Scenario: Removal clears the feed

- **WHEN** a member is removed from the Team
- **THEN** their Subscriptions on the Team's Topics deactivate, and the Team's private Topics leave their feed

### Requirement: Bookmarks stay personal, with a team scope for display

Bookmarks SHALL remain keyed to the user with no schema change. Anyone the permission helper grants access SHALL be able to bookmark a team Topic's Findings. Removing a bookmark SHALL only ever remove the acting user's own row.

On a team Topic, the Bookmarked position in the feed filter SHALL offer two scopes — Mine and Team — with Team showing every member's bookmarks with the avatar of whoever saved each one. The scan-time prune SHALL spare a Finding only while some holder of a bookmark on it still has access to the Topic, so a departed member's saves stop holding Findings and leave the Team scope together. A deliberately assembled shared reading list is a different noun — a collection — and is deferred, not solved by overloading bookmark.

#### Scenario: The two scopes return different rows

- **WHEN** a member filters a team Topic to Bookmarked
- **THEN** Mine returns only their own bookmarks and Team returns every member's, each row showing its saver

#### Scenario: One member cannot destroy another's save

- **WHEN** a member removes a bookmark from the Team scope
- **THEN** only their own row is deleted, and another member's bookmark on the same Finding survives

#### Scenario: A departed member's bookmarks stop protecting

- **WHEN** a member with bookmarked Findings loses access and the prune next runs
- **THEN** Findings held only by their bookmarks may be pruned, and their rows leave the Team scope

### Requirement: A Team is private or public, with a leader-only toggle that says what it shows

Team visibility SHALL have exactly two values. Private, the default: to everyone but members, admins, and anyone a pending invitation names, the team page answers 403 with nothing but the Team's name and a way to ask for an invitation, so an outsider can request their way in without learning anything else, while a team id that resolves to nothing still answers 404. An invitee reading the page before joining sees the members as the public page shows it and every held Topic, since the list is what they are deciding on. Public: the page renders to anyone. There is no invite state, because membership already is the invite list.

The toggle SHALL be leader-only.

#### Scenario: A private team shows outsiders its name and nothing more

- **WHEN** anyone who is not a member and holds no pending invitation requests a private Team's page
- **THEN** it answers 403 with the Team's name and a request-an-invitation action and nothing else, while a team id that resolves to nothing answers 404

### Requirement: Member visibility is per member per Team

Each membership SHALL have its own member-visibility opt-out, defaulting to visible. Opting out hides that member from the public page only — members always see the full members list. The public page SHALL list visible members and then a count of the remainder, so a Team never appears smaller than it is, and every member may opt out, leaving a public page with no members listed.

#### Scenario: Opting out hides from the public only

- **WHEN** a member opts out of the members
- **THEN** the public page omits them while counting them in the remainder, and other members still see them listed

#### Scenario: The remainder count keeps the size honest

- **WHEN** three of five members opt out
- **THEN** the public page lists two members and reports three more

### Requirement: Attribution on a public Topic is derived, never stored

A public Topic's byline SHALL credit the owning team when the Team is public or the viewer is one of its members, and the creator otherwise, derived at read time so flipping a Team public moves attribution with no migration. A team the Topic is only shared into never takes the byline. A member who opted out of the members stays hidden under team attribution. The byline SHALL link to the team page only when the viewer can reach it — the Team is public or the viewer is a member — and to the creator's profile otherwise, so an outsider is never linked to a team page that refuses them.

#### Scenario: Flipping the Team moves the credit

- **WHEN** a private owning Team with a public Topic goes public
- **THEN** that Topic's byline credits the Team, with no data written to the Topic

#### Scenario: The byline never links to a refusing page

- **WHEN** an outsider views a public Topic whose Team is private
- **THEN** the byline credits and links the creator, not the gated team page

### Requirement: Signals are recorded and never acted on

Three captures SHALL be added, all inactive. The existing thumb SHALL gain rater identity — who cast it, the Topic's owning team at the time (null when no team owns it, even when shared-into teams hold it), and the caster's effective role at the time, denormalized so the label keeps the meaning it had when cast. A feedback table SHALL store verbatim freeform text against the Finding and Topic, written from the finding popover, with no extraction and no effect on scoring. A view-event table SHALL record opens and dismissals — marked read without opening. How long a finding stays open belongs to the analytics product, not this database.

Nothing SHALL surface, aggregate, score with, or rank by any of it. Tuning is a later decision; what ships is the columns, because none of them can be backfilled.

#### Scenario: A thumb records its rater

- **WHEN** a member rates a Finding on a team Topic
- **THEN** the rating records who cast it, the Topic's owning team at that moment — null when only shared-into teams hold it — and the caster's effective role, and clearing the rating clears all three

#### Scenario: Feedback is stored verbatim and changes nothing

- **WHEN** a user types feedback on a Finding
- **THEN** the text is stored as written against that Finding and Topic, and no score, rank, or rule changes anywhere

#### Scenario: Ranking is untouched

- **WHEN** any amount of signal accumulates
- **THEN** feed order, prune decisions, and scoring are exactly what they would be with none of it

### Requirement: A join request is a member that is not active

An outsider on a team page SHALL see a Join Team button — a plus icon with an "Ask to join" tooltip naming the Team, becoming a minus with a delete-request tooltip once asked — at the header row's top right with the flag directly below it, and the same button in a private Team's gate notice. A signed-out visitor sees the same button with a sign-up tooltip, and their click goes to sign-up. Clicking it SHALL write the viewer's `team_members` row with `is_active` false. An inactive row grants nothing: every read that grants through membership — roles, feeds, rooms, quotas, counts, connections — SHALL filter to active rows, and the row SHALL be visible only to the Team's leaders, who see it in the members table with the Active toggle off. Member counts everywhere — the page header, the table totals, share previews, the teams index — SHALL count active members alone.

Switching an inactive row's toggle on SHALL admit the requester through the same join path any admission takes — activating the row, writing the muted Subscriptions, and enforcing the member limit — and the row's X removes it like any member's, which is the decline. While a request stands, the requester's Join button SHALL show the icon filled with a "Delete request to join" tooltip, and clicking it takes the request back by deleting the row; the withdraw SHALL only ever delete a row that is not active, never a real membership.

#### Scenario: A request grants nothing

- **WHEN** a signed-in outsider asks to join a Team
- **THEN** an inactive member row exists that no one but a leader can see, and the requester still holds no role, feed access, or room access through it

#### Scenario: The toggle admits and the X declines

- **WHEN** a leader switches a request row's Active toggle on
- **THEN** the requester becomes a member with muted Subscriptions under the member limit, and pressing the row's X instead would have deleted the request

#### Scenario: The requester takes it back

- **WHEN** a requester clicks their filled Join button
- **THEN** their request row is deleted, and the same action on an admitted membership deletes nothing

### Requirement: Two roles, and a Team never reaches zero leaders

Roles SHALL be leader and member only. A leader manages membership, promotes other leaders, attaches and detaches Topics, and controls the public toggle; a member edits team Topics and chats. Multiple leaders are allowed, and the last leader SHALL be blocked from leaving or demoting themselves until another leader exists.

#### Scenario: The last leader is held

- **WHEN** a Team's only leader tries to leave or demote themselves
- **THEN** the request is rejected until they promote someone

### Requirement: Departure and deletion have explicit rules

When a team Topic's creator leaves its owning Team or their plan can no longer fund it, its Scans SHALL pause instead of failing silently. The pause holds until the creator can fund it again or the Topic leaves the Team; ownership never moves.

#### Scenario: A departed creator's Topic pauses

- **WHEN** the creator of a team Topic leaves its owning Team
- **THEN** the Topic's Scans stop running instead of failing silently, and it stays the creator's own

#### Scenario: Deleting a Team returns its Topics

- **WHEN** a leader deletes a Team
- **THEN** every Topic it owned returns to its creator and every shared holding ends, with team access ended

### Requirement: One Team icon, three entry points, one create modal

A Team SHALL be represented by the Lucide Users icon everywhere one appears — the header menu item, the Team Up button, the teams index, the team badge on a Topic, and the team page header — and no second team icon is introduced.

The topic page's action row SHALL hold exactly one button on each end. The right end is the page's one call to action, picked in this order: Brew for whoever may scan, Join Team for a viewer on none of the Teams holding the Topic, Follow for a signed-out visitor, and Team Up for everyone else. The left end holds Team Up where it renders, and Share where nothing else claims the side. Following SHALL never be a second button on the left. It is either the call to action or a row in the search bar's actions menu, which keeps the row to one control a side on a narrow screen. Share SHALL appear in that menu whether or not the Share button renders, directly above Edit, and the follow row leads the menu. Team Up renders for any signed-in viewer, except an outsider on a private Topic, which stays its owner's alone to hand over. Toggling follow from either place SHALL confirm with a toast naming the Topic. On an unheld Topic it opens the create modal — two lines on what a Team gives, shared editing and a room with Carl, then attach to a Team the viewer leads or create a new one with the name prefilled from the Topic. On a held Topic its icon fills for a leader of any holding Team, whose menu lists each led holding Team with a remove X and each other led Team as an "Add to <team>" row behind a plus, sharing the Topic in; every other viewer keeps the plain attach view.

The topic create and edit form SHALL offer a Team field to the same viewers Team Up serves: no team, one of the teams the viewer leads, or a new team created on save with the saved topic attached. The new team's draft opens in place with a name, its Members fields, and the Public toggle; a draft left unnamed creates nothing, and the topic saves on its own. On a topic whose owning team the viewer leads it offers that team or no team; on one owned by a team the viewer does not lead it stays hidden. The picked destination applies after the topic saves, and a failed attach keeps the saved topic and says so.

A teams index SHALL live behind a Teams item in the header menu directly below Profile, listing the viewer's Teams with their role in each and who invited them — the viewer's own profile when nobody did — beside a New Team button and the only leave button, governed by the last-leader rule. A pending team invitation SHALL render as an inactive row of the same table: its role reads invited, Invited by names the sender, the member and topic counts open the same members and topics subtables a membership row has, read-only, so an invitee can look before joining, the spend shows like a membership's, and the Active toggle joins — its tooltip reads "Join <team>" — while the X declines. A membership's toggle leaves with a "Leave <team>" tooltip, except for a team's only leader, whose toggle reads "Assign a new leader to leave" and opens the members subtable instead of toggling. When the viewer belongs to no teams, the index SHALL offer a call-to-action line that opens the create modal, in the shape the activity page's empty topics section uses. A Team created from any entry point appears there immediately. Creating from the index offers a multiselect of the Topics the viewer may bring — their own at any visibility first, then every public Topic and the invite Topics they can read, each group alphabetical, with a Topic held elsewhere offered too since attaching shares it in — and suggests a name instead of presenting an empty field. Every entry point SHALL share one modal, differing only in prefill and multiselect.

The team form SHALL offer a username field beside its email field, staging each entered username as a chip the save sends; when the invitations send on save, a refused one — unknown username included — is reported by name and no invite exists for it.

#### Scenario: The action row holds one button a side

- **WHEN** the topic page renders for an owner, a team member, a signed-in outsider, and a signed-out visitor
- **THEN** each of them sees exactly one button on the left and one on the right, with following in the actions menu wherever it is not the call to action

#### Scenario: A Topic a Team holds offers the way in

- **WHEN** a viewer on none of a Topic's holding Teams opens its page and the owning Team is public
- **THEN** Join Team is the right-hand call to action, Follow moves into the actions menu, and the Share button gives the left to Team Up or stands in itself

#### Scenario: The picker leaves out only what the team holds

- **WHEN** the create modal offers Topics to attach
- **THEN** only Topics the target team already holds are absent from the multiselect, and a Topic held by other teams alone is offered

#### Scenario: One modal serves every entry point

- **WHEN** a Team is created from the topic page and from the index
- **THEN** the same modal ran both times, differing only in the Topic prefill and the multiselect, and the new Team lists on the index at once

### Requirement: The team page is the profile template pointed at a Team

The team page SHALL reuse the profile page's layout, topic table, and follower count, adding the members and, for a leader, membership and role management, attach and detach, and the public toggle. The topic table SHALL be the profile page's own component over the same row contract — Topic, Created, Updated, Visibility, Followers, and Kept / reviewed, with the mention badges and totals — so the two pages never drift, and no creator's plan name appears anywhere on it. For a leader alone it adds an Active column: its header's tooltip reads "Active team topics", its toggle detaches the topic with a "Deactivate <topic>" tooltip, and the X beside it detaches the same way. The members table's Active column includes the matching tooltips — "Active team members" on the header, and "Activate <member>" or "Deactivate <member>" on the toggle by its state. Copy keeps the codebase's pattern: small uppercase section labels with Carl-voiced body copy.

#### Scenario: The topic table matches the profile page

- **WHEN** a member views the team page's topic table
- **THEN** it shows the profile page's columns and totals over the same rows contract, with the Active column added only for a leader

#### Scenario: Leader controls are leader-only

- **WHEN** a member who is not a leader views the team page
- **THEN** the members and Topics render without membership, attach, detach, or visibility controls

### Requirement: Team creation and size are limited

A daily creation limit SHALL keep team creation from flooding the invitations others receive, and each plan SHALL limit how many members a led Team may hold, with the best plan among a Team's leaders setting the limit. No plan SHALL limit how many Teams an account leads.

#### Scenario: The daily creation limit holds

- **WHEN** an account that already created its daily allowance of Teams creates another
- **THEN** the creation is rejected as over quota until the next day

#### Scenario: One paying leader lifts the member limit

- **WHEN** a free-led Team at its member limit promotes a paid member to leader
- **THEN** the next join is admitted under the lifted limit

### Requirement: Deleting a led team never blocks and never strands members

A leader SHALL be able to delete any team they lead, including the last one — no code depends on a
user leading a team, and the teams index designs the zero-team state. Deleting a team whose only
active member is the caller SHALL delete it outright, its topics returning to their owners.

Deleting a team that has other active members SHALL NOT destroy their shared space: the caller
leaves instead, and when no other leader remains, the oldest active member — earliest membership
row — SHALL be promoted to leader first. The response SHALL name the new leader so the UI can say
who holds the team now.

#### Scenario: The solo default team deletes to zero teams

- **WHEN** a user deletes the only team they lead and they are its only member
- **THEN** the team is deleted and the user has no teams

#### Scenario: A populated team survives its leader leaving

- **WHEN** the only leader deletes a team that has other active members
- **THEN** the oldest member becomes leader, the caller is removed, and the team survives

### Requirement: An invite targets a Topic or a Team, with liveness by expiry and uses

The invites table SHALL have exactly one target — a Topic or a Team — with the token lifecycle (limits, expiry, rejections) unchanged from the invite-links change. Creating a team invite SHALL require membership. Accepting a leader's invitation SHALL write a membership row and the muted Subscriptions. Accepting a member's open link SHALL write a not-yet-active membership row instead — a join request a leader activates like any other, with the muted Subscriptions written at activation — so a link pasted anywhere cannot add a stranger.

An invitation addressed to the accepter SHALL admit them outright, whoever created it. Addressed means the invitation names their account in `invited_user_id`, or carries an email address their account has verified — an email invite sent before they signed up resolves to no account, and matches by address instead. Naming someone is a deliberate act toward one person, so it is a convenience and SHALL NOT wait on a leader.

An unverified address SHALL NOT match. Signup does not require verifying an address, so matching one would admit whoever claims it. An accepter whose address is unverified SHALL fall through to the join request.

An open link SHALL also admit outright when a separate live invitation to the same Team addresses the accepter: they were already expected, and which invitation they happened to open SHALL NOT decide whether they get in. Addressed means the same thing on both paths, so an invitation carrying a verified address admits through an open link exactly as one naming the account does. An invitation that names nobody SHALL NOT admit anyone this way. Liveness SHALL be the same refusal check both accept paths already apply, so an expired or spent invitation admits nobody.

Admission SHALL be the same write in every case: a membership row that activates a waiting join request where one already exists, with the muted Subscriptions written at that moment.

Either way the accepter is sent to the team page. Removing a member SHALL revoke access on the next request and leave their authored room messages in place, still attributed.

#### Scenario: A team invite makes a member

- **WHEN** a signed-in visitor accepts a team invite token
- **THEN** a member-role membership is written, muted Subscriptions follow, and they arrive on the team page

#### Scenario: A member's invitation by username admits its recipient

- **WHEN** someone a member invited by username accepts that invitation
- **THEN** a membership row and the muted Subscriptions are written, and no join request is created

#### Scenario: An email invite admits someone who signed up afterward

- **WHEN** someone whose address is verified accepts an invitation sent to that address before their account existed
- **THEN** the address matches them, a membership row is written, and no join request is created

#### Scenario: An unverified address does not match

- **WHEN** someone whose address is unverified accepts an invitation carrying that address
- **THEN** the address does not match them and they appear as a not-yet-active row

#### Scenario: A member's invitation waits on a leader

- **WHEN** someone accepts an open link a non-leader member created and no invitation addresses them
- **THEN** they appear in the members table as a not-yet-active row a leader can activate, and hold no access until then

#### Scenario: An outstanding invitation admits through an open link

- **WHEN** someone already invited by name accepts a member's open link to the same Team
- **THEN** a membership row and the muted Subscriptions are written, and no join request is created

#### Scenario: An outstanding email invitation admits through an open link

- **WHEN** someone whose address is verified, invited at that address before their account existed, accepts a member's open link to the same Team
- **THEN** the address matches them, a membership row is written, and no join request is created

#### Scenario: An unnamed link vouches for nobody

- **WHEN** someone accepts a member's open link while the team's only other live invitation names nobody
- **THEN** they appear as a not-yet-active row, exactly as if no other invitation existed

#### Scenario: A dead invitation vouches for nobody

- **WHEN** someone accepts a member's open link and the invitation naming them is expired or spent
- **THEN** they appear as a not-yet-active row

#### Scenario: A waiting join request activates

- **WHEN** someone who already appears as a not-yet-active row accepts an invitation addressed to them
- **THEN** their existing row becomes active instead of a second row being written

#### Scenario: Only a member invites to a Team

- **WHEN** someone outside the team creates a team invite
- **THEN** the request is rejected

#### Scenario: Removal is immediate and non-destructive

- **WHEN** a leader removes a member
- **THEN** the member's next request finds no access, and every message they authored remains, attributed to them

