# invite-share-sheet Specification

## Purpose
TBD - created by archiving change add-invite-share-sheet. Update Purpose after archive.
## Requirements
### Requirement: The share menu offers the operating system's share sheet on mobile

The share menu SHALL include one row that opens the operating system's share sheet through `navigator.share`. It SHALL sit among the menu's existing destinations instead of replacing any of them or standing outside the menu as a control of its own, and SHALL be labelled as sending the invite instead of as posting the Topic.

The row exists because the applications an invite travels through are unreachable any other way. Instagram publishes no share url and no direct-message intent, WeChat's sharing requires a verified Official Account and only fires inside WeChat's own browser, and Discord, Slack, Signal, and Snapchat publish nothing a url can target. Each of them registers as a share target with the operating system, so the sheet reaches every one that is installed without the app naming any of them.

#### Scenario: The sheet opens with the invite

- **WHEN** a user activates the share-sheet row in the share menu on a mobile browser
- **THEN** the operating system's share sheet opens with the Topic's name and the invite URL for a created invite token

#### Scenario: The sheet is not the topic share

- **WHEN** the invite share-sheet row and the public topic share are both available to a user
- **THEN** they are separate rows with separate labels, one handing out an invite and the other posting the Topic's own url

The Team share menu SHALL carry the same row, since a Team is joined by link exactly as a Topic is
subscribed to by one. Any member SHALL see it, and it SHALL NOT be gated on the Team being public:
handing someone a link that joins a private Team is what a Team invite is for, while the rows that
post the Team's own page stay gated on it. Both the Topic and the Team link SHALL record the
`invite_created` event with the source that asked for it, so one ratio measures links to either
target.

#### Scenario: A member shares a team invite

- **WHEN** a member activates the invite row in a Team's share menu on a mobile browser
- **THEN** a team-targeted token is created, the sheet opens with the Team's name and that token's invite URL, and the event records the share-sheet source

#### Scenario: A private team still invites by link

- **WHEN** a member opens the share menu on a Team that is not public
- **THEN** the rows that post the Team's page are disabled with the reason, and the invite row stays available

### Requirement: The row renders on mobile only

The share-sheet row SHALL be rendered only on mobile, gated on `navigator.share` being present and on a coarse pointer. It SHALL NOT be rendered on desktop, including the desktop browsers that have the API, where the sheet lists a printer and a mail client instead of the messaging applications the row exists for.

Where the row is absent the share menu SHALL be exactly what it is today: the copy row copies the Topic's page url, and no topic invite link is handed out there, a deliberate scope cut since the sheet is the invite's own channel. A row that cannot fire SHALL NOT be rendered, disabled or otherwise, because no action available to the user would make the sheet appear.

Feature detection SHALL read `navigator.share` itself instead of a user-agent string, and SHALL NOT consult `navigator.canShare`, which answers a question about payloads that only files raise.

#### Scenario: A browser without the API keeps the menu it has

- **WHEN** the share menu opens in a browser with no `navigator.share`
- **THEN** no share-sheet row is rendered, the copy row copies the Topic's page url, and no invite link is handed out there

#### Scenario: Desktop gets no row

- **WHEN** the share menu opens on a desktop browser that does have `navigator.share`
- **THEN** no share-sheet row is rendered

#### Scenario: No dead row

- **WHEN** the share menu opens in any browser
- **THEN** every row it renders for the sheet can fire, and none is shown disabled for a missing sheet

### Requirement: A token is created once per share, inside the click handler

Activating the share-sheet row SHALL create an invite token through the same route the menu's other destinations use, and SHALL do so once per activation. Rendering the share menu SHALL NOT create a token, and neither SHALL opening it, hovering the row, or focusing it.

The token SHALL be created and awaited inside the click handler, so that none is written for a person who never shares. The share sheet requires user activation, and a token that returns after the browser's activation window has closed SHALL be reported as a rejection instead of as a share.

#### Scenario: Rendering creates nothing

- **WHEN** the share menu renders, opens, re-renders, or its share-sheet row is hovered or focused
- **THEN** no invite token is created

#### Scenario: One create per share

- **WHEN** a user activates the share-sheet row twice
- **THEN** two tokens are created, one per activation, and neither activation creates more than one

### Requirement: The share payload includes the invite URL for the created token

The payload handed to the sheet SHALL include the Topic's name and the absolute `/invite/:token` url for the token created by that activation. It SHALL NOT include the Topic's own url, which grants nothing on a Topic that is not public, and SHALL NOT include a file or an image.

#### Scenario: The url is the invite URL

- **WHEN** the sheet opens from the share menu
- **THEN** the url in its payload is the absolute invite URL for the token created by that same activation, not the Topic's page url

### Requirement: A refused share falls back to copying the link, and a dismissal does not

Where the browser rejects the share for missing user activation, the invite URL SHALL be copied to the clipboard and the row SHALL report that the link was copied. It SHALL NOT report that the invite was shared, since it was not, and the person needs to know what is now on their clipboard.

Where the person dismisses the sheet without choosing a destination, nothing SHALL be copied and no error SHALL be surfaced. A dismissal is a decision, not a failure. The token created for it stays valid until it expires or is revoked.

#### Scenario: A rejected gesture copies instead

- **GIVEN** a browser that rejects the share call because its user-activation window has closed
- **WHEN** a user activates the share-sheet row
- **THEN** the invite URL is copied to the clipboard and the row reports that the link was copied, not that it was shared

#### Scenario: A dismissed sheet is quiet

- **WHEN** a user opens the sheet and dismisses it without picking a destination
- **THEN** nothing is copied, no error is shown, and the created token remains valid

### Requirement: One helper makes the sheet call for every caller

The call to `navigator.share`, its feature detection, and the distinction between a completed share, a dismissal, and a rejection SHALL live in one helper. Every caller SHALL reach the sheet through it. The helper SHALL know nothing about Topics, invites, or tokens, and each caller SHALL own its payload, its label, and its fallback.

The helper has two callers today: the public topic share, which opens the sheet with the Topic's own url, and the invite share, which opens it with an invite URL. Each keeps its own payload and label, and neither writes the `navigator.share` call itself.

#### Scenario: The sheet call is written once

- **WHEN** a caller opens the share sheet
- **THEN** it goes through the helper, and no `navigator.share` call is written anywhere else

### Requirement: The sheet reports no destination, and nothing claims otherwise

The share sheet SHALL NOT be treated as a source of attribution. It resolves identically whichever application the person picks, includes no destination, no application identifier, and no recipient, and offers no callback that could include one.

The one event SHALL be `invite_created`, logged when the token is created, including a source naming which of the app's own controls asked for it — "share-sheet" here — and no destination, application name, or recipient field. Attribution for an invite SHALL come from acceptance, which names the token, the Topic, and the account that accepted it.

Neither the sheet opening nor a completed share SHALL be logged as an event of its own. Analytics here is server-side, so a browser-side event would mean a browser SDK or a ping endpoint, and the creation already stands one-to-one with a share: it happens in the same click, immediately before the sheet opens, and diverges only when the browser rejects the gesture. What gets measured is `invite_created` counts by source against acceptances.

#### Scenario: One event, naming a control and not a destination

- **WHEN** a user shares an invite through the sheet
- **THEN** the token's creation is logged with the control that asked for it, and nothing records where the invite went

#### Scenario: Attribution comes from acceptance

- **WHEN** an invite that was shared through the sheet is accepted
- **THEN** the acceptance is what names the token, the Topic, and the accepting account

### Requirement: A token shared through the sheet is limited, expiring, and revocable

A token handed to the share sheet SHALL be the same kind of token the menu's other destinations hand out, with the same `max_uses` limit, the same expiry, and the same revoke control. No looser token kind SHALL be introduced for this path.

A token given to the sheet can end up in a group chat, a screenshot, or a public post, which makes it the path most in need of those limits instead of the one that can do without them. One kind also keeps the revoke control covering every route a token left by.

#### Scenario: The sheet's token is limited and expiring

- **WHEN** a token is created for a share through the sheet
- **THEN** it has the same use limit and expiry as a token created for any other invite destination

#### Scenario: Revoking reaches a shared token

- **WHEN** an owner revokes an invite token that was handed out through the sheet
- **THEN** the invite URL stops accepting, exactly as it does for a token handed out any other way

