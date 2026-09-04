# invitations Specification

## Purpose
TBD - created by archiving change add-username-invites. Update Purpose after archive.
## Requirements
### Requirement: An invite names a person by email or by username, one object either way

A user invite SHALL live on the same invites row every invite already is — never a second table, entity, or code path. The email column records which identifier the sender used, the invited user records the resolved recipient: a username invite has the user alone, an email invite has the address and gains the user when it resolves, and a link invite has neither. Each creation path SHALL set only its own identifier column, and per-target unique indexes on the invited user SHALL make re-inviting the same person a no-op, across modes included. Everything downstream of creation — expiry, acceptance, and display — SHALL treat the two identifiers identically apart from whether an email is sent.

Creating a username invite SHALL resolve the username first and refuse an unknown one, so no invite row is ever written for a name no account holds. The sender surfaces stage each entered username as a chip and report a refusal by name when the invitations send.

#### Scenario: Both modes share one lifecycle

- **WHEN** an email invitation and a username invitation to the same Topic expire and are accepted
- **THEN** each behaves identically at every step, and only the email one ever produced mail

#### Scenario: An unknown username never becomes an invite

- **WHEN** a sender addresses an invite to a username no account holds
- **THEN** the send is refused, the refusal names the username to the sender, and no invite row exists

### Requirement: Email sends mail, username never does, and that asymmetry is deliberate

An email invite SHALL send the invitation email and write the row. A username invite SHALL write the row and send nothing: it surfaces in the recipient's invitations section and nowhere else, and email delivery SHALL NOT be added to the username path.

#### Scenario: A username invite reaches the invitations section alone

- **WHEN** a member invites someone by username
- **THEN** the invitation appears in that person's invitations section, and no email of any kind is sent

#### Scenario: An email invite reaches both

- **WHEN** a sender invites an address with no account
- **THEN** the invitation email sends and the row waits for whoever signs up with that address

### Requirement: An email invite to a known address resolves to its account

When an email invite's address already belongs to an account, creation SHALL set the invited user on the row so the recipient holds one invitation instead of an orphaned pending row, and the email SHALL still send. Each row SHALL render the identifier the sender used — the username when sent by username, the address when sent by email.

#### Scenario: A known address is one invitation, not two rows

- **WHEN** a sender email-invites an address that belongs to an account
- **THEN** the row names that account, the mail still sends, and the recipient's invitations section shows it once, rendered by the address the sender used

### Requirement: A sender's invite limit is computed from plan, age, and reputation

The per-sender invite limit SHALL be computed from the plan's base, an account-age factor that sharply reduces a young account's reach, and an accept-rate reputation factor measured from the accept and decline outcomes this change records: among the sender's user invitations at least a week old, the share accepted, where a still-pending week-old invitation counts as ignored. A sender mostly declined or ignored has their limit reduced automatically, and never below one per day. Declining SHALL stamp the row instead of deleting it, so the signal is measurable, and the topic-save reconciliation SHALL leave declined rows in place instead of erasing them. Email and link creation draw from the same limit; a username invite SHALL spend none of it, since it sends nothing and the recipient's own invite-access setting guards it. One batch exception: the topic-save review checks its whole batch against the limit with the connection doubling unapplied, treating every recipient as unconnected for the count, while each recipient's invite-access check still derives the real connection.

#### Scenario: A day-old free account sends few

- **WHEN** an account created this week hits its invite limit
- **THEN** further user invites are rejected as a quota, at a small fraction of the plan's base

#### Scenario: Ignored invitations lower the limit

- **WHEN** most of a sender's week-old user invitations were declined or still sit pending
- **THEN** their limit is reduced, while never reaching zero

#### Scenario: A connected recipient raises it

- **WHEN** a sender invites someone they share a Team with
- **THEN** that creation draws from a doubled limit

### Requirement: A recipient chooses who may invite them

Each account SHALL have an invite-access setting, stored as anyone, connected, or nobody with "People I interact with" as the settings copy for connected, defaulting to anyone, and changed from the Account page's settings. It SHALL be enforced at creation for both modes — an email invite that resolves to an account consults it too — with a rejected invite never written and the sender told the recipient is not accepting invitations.

#### Scenario: Each setting is honored for both modes

- **WHEN** username and resolved email invites address a recipient under each of the three settings
- **THEN** anyone admits all of them, connected admits only connected senders, and nobody admits none

#### Scenario: The setting is the recipient's to change

- **WHEN** a user opens their Account page settings
- **THEN** the invite-access setting shows their current choice and saves a new one

### Requirement: Connections are derived, never stored

A sender SHALL count as connected to a recipient when they share a Team, when the recipient holds an active subscription to one of the sender's Topics, or when the recipient accepted an invitation from the sender before. Connected senders SHALL skip the connected restriction and draw from a raised invite limit. No connection table, no friend request flow, and no stored graph SHALL exist; the derivation runs at creation time from rows that already exist.

#### Scenario: Each derivation connects

- **WHEN** a sender shares a Team with the recipient, or the recipient subscribes to one of the sender's Topics, or once accepted their invitation
- **THEN** each on its own makes the sender connected, skipping the connected restriction

#### Scenario: Nothing is written to say so

- **WHEN** two users become or stop being connected
- **THEN** no row anywhere records the connection itself

### Requirement: Invitations route to the page of their kind, and both pages share one shape

Topic invitations SHALL surface on the Activity page and Team invitations on the Teams page. On the Activity page the invitations section holds received invitations first, each with accept and decline, and the sender's own sent invitations below with their withdraw toggle, with the subscriptions section between the two. On the Teams page a received invitation SHALL render as an inactive row of the Your teams table itself — its role reads invited, the Invited by column names the sender, the member and topic counts open the team's members and topics subtables read-only, the spend shows like a membership's, and the Active toggle joins while the X declines — and the invitations section below holds only the invitations the viewer sent. Accepting SHALL do exactly what accepting the invitation's token does — subscribing to its Topic or joining its Team — whether it was addressed by email or by username.

#### Scenario: Each kind on its own page

- **WHEN** a user holds a pending Topic invitation and a pending Team invitation
- **THEN** the first renders on the Activity page, the second on the Teams page, and neither on the other

#### Scenario: Accepting a row matches accepting its token

- **WHEN** a recipient accepts a Team invitation from the Teams page
- **THEN** membership and its muted Subscriptions are written exactly as the token's acceptance writes them

#### Scenario: Decline is quiet and recorded

- **WHEN** a recipient declines an invitation
- **THEN** it leaves both pages, the sender is not notified, and the outcome is measurable for reputation

### Requirement: An invitation that admits its recipient is spent

When an invitation admits the person it addresses through a different invitation to the same Team, the addressing invitation SHALL be consumed. It SHALL NOT remain in the recipient's invitations list as though it were unanswered, and its use SHALL count toward the sender's invite limit exactly as a directly accepted invitation does.

#### Scenario: The addressing invitation leaves the recipient's list

- **WHEN** an invitation admits the person it addresses through a different invitation
- **THEN** the addressing invitation is spent and no longer stands unanswered for that recipient

#### Scenario: The sender's limit counts it once

- **WHEN** an addressing invitation is consumed by admitting its recipient
- **THEN** it counts toward that sender's invite limit as an accepted invitation

### Requirement: Reusing a live link spends no invite slot

A link creation that returns the caller's existing live link for the target SHALL spend no slot from
the daily limit, since nothing was written and no new bearer token exists.

#### Scenario: Re-sharing a topic all day costs one slot

- **WHEN** an owner clicks create-link for the same topic repeatedly in one day
- **THEN** one row exists, one slot was spent, and every click returned the same link

