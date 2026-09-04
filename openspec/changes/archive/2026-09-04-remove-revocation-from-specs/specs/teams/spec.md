## REMOVED Requirements

### Requirement: An invite targets a Topic or a Team

**Reason**: Its liveness rule and one scenario named a revoked invitation. Closing an invite link was removed with its column in migration 0084, so no invitation can be revoked.

**Migration**: Replaced by "An invite targets a Topic or a Team, with liveness by expiry and uses", which keeps every other rule unchanged. Liveness is now expiry and the use limit alone, and the scenario "A revoked invitation vouches for nobody" becomes "A dead invitation vouches for nobody", covering an expired or spent invitation.

## ADDED Requirements

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
