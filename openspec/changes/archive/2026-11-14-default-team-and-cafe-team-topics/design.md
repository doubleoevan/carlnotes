# Design

## Context

Every create path ends in `createTopic` with an optional `draftTeamId`, which adds the new Topic to that Team through
the leader-only `addTopicToTeam`. The form adds Teams on the client after the save. The Café reads a person's owned
Topics for its tiles and its visitor table, and the person's own table comes from the Activity page's read.

## Goals / Non-Goals

**Goals:** one rule for which Team a shared Topic starts on, applied by every create path and by a switch from private;
a Café that shows a leader's team Topics and the Topics of every Team a member is on.

**Non-Goals:** moving a Topic that a Team already holds, changing the Activity page, or letting a pin reach a Topic the
person does not own.

## Decisions

### D1. The default team is the oldest leader membership

`loadDefaultTeam` orders active leader memberships by `team_members.created_at`, then by the Team's own creation time.
The teams summary marks it with `isDefaultTeam`, and the chat lists it first.

### D2. Each path keeps its own way to say no team

The form's Team field starts on the default team and may be cleared, so an explicit empty choice sticks. MCP
`create_topic` takes an omitted `team` as the default team and `null` as no team. The new-topic chat keeps `team: null`
as unset, so a shared draft for a leader always goes on a led Team and Carl offers the others.

### D3. A switch from private applies the default after the save

`updateTopicFields` calls `addTopicToDefaultTeamOnVisibilityChange` after its transaction, which adds the Topic only if
no Team owns it or has it shared in. An MCP edit that names its own team change skips it. The saved line names the
Team.

### D4. The Café reads tiles and table separately

The tiles read the person's Topics and those held by the Teams they lead, owned or shared in, limited to public Teams
and public Topics for anyone but the person and an admin. The person's own table reads every Topic of every Team they
are an active member of. The profile route adds `ownTopics`, the owner table's rows over the same Topics, so the page
needs no second read. A row the person does not own shows no month's cost, no scans, and no email switch.

### D5. Pins count only on owned Topics

The pin position is the Topic's `profile_order` only if the person owns it, in the tiles' order and in the podcast
and film reads, so a team Topic's owner's pin does not lead another member's Café. The rank dialogs offer owned public
Topics alone.

## Risks / Trade-offs

- A leader of many Teams with many shared Topics reads more rows on their Café. The reads stay one query each.
