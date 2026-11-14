# Proposal

## Why

A public or invite Topic has to sit on a Team today. The form blocks the save until one is picked, and Carl stops the
new-topic chat to ask which Team. A user who leads one Team answers the same question every time, and a user who leads
none can only make a private Topic with Carl. The Café shows only the Topics a person owns, so a leader's Café leaves
out the Topics their Teams hold, and a member's own table leaves out the Topics of the Teams they are on.

## What Changes

- **A default team.** A user's default team is the Team of their oldest active leader membership. A Topic created
  public or invite, or switched from private to either, goes on it on the web and mobile form, in the new-topic chat,
  through MCP `create_topic`, and on a visibility change through the chat or MCP `edit_topic`. A Topic a Team already
  holds keeps it, and a user who leads no Team gets the Topic at its visibility on no Team.
- **No team requirement.** The form drops its required Team field and the chat drops its create-time team check. The
  form's Team field starts on the default team and can change to another led Team or to no team.
- **Carl's read-back names the team.** Carl says which team a shared draft is on and offers the user's other led Teams
  as a way to change it, without asking first. `chat-new-topic.md` moves to version 17.
- **The Café gathers team topics.** The Featured Topics, Films, and Podcasts tiles add the Topics held by Teams the
  person leads. A visitor sees public Topics of public Teams alone. The person's own All Topics table lists every Topic
  they own and every Topic held by a Team they are an active member of, at every visibility, each once. The count
  follows the table, pins stay the owner's alone, and a row the person does not own shows no owner's controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-creation-chat`: the wizard puts a shared draft on the default team instead of asking, and the create tool no
  longer rejects a shared draft with no team.
- `teams`: a shared Topic goes on the user's default team from every create path and on a visibility change.
- `public-profiles`: the Café's tiles and the person's own table include the Topics of their Teams.

## Impact

- `apps/api/team/defaultTeam.ts` is new. `apps/api/team/helpers.ts`, `apps/api/chat/`, `apps/api/tool/`, and
  `apps/api/mcp/topicEditTools.ts` apply the default team.
- `apps/api/profileCards.ts` and `apps/api/profiles.ts` widen the Café's reads, and the profile response gains
  `ownTopics` and the cards' ownership flags.
- `packages/core/hooks/useTopicTeamChoice.ts`, both apps' `EditTopicModal`, the web `TopicTeamSelect`, and both apps'
  profile pages and `OwnerTopicsTable` change.
- The new-topic chat eval's team cases change.
