## Why

A user who leads teams made a public topic with Carl, and Carl never asked which team it goes on. The prompt let him
skip the question, and the create tool saved a public topic with no team. The topic form treats a team as part of a
shared topic, so the chat made a topic the form would not have.

## What Changes

- The new-topic chat prompt tells Carl that a public or invite topic goes on a team. Unless the draft is private or
  already names a team, he names the user's teams and asks which one. A user who wants no team, or who leads none,
  gets a private topic, and Carl says so and writes the visibility as private.
- The chat's create tool saves no public or invite draft that names no team. It returns a line telling Carl to ask
  which team, or to make the topic private, and creates nothing.
- The read-back before the yes includes the team.
- The new-topic chat eval gets a leader team and two cases: a public topic asks which team, and a public topic with
  no team is made private.

## Capabilities

### New Capabilities

### Modified Capabilities

- `topic-creation-chat`: a public or invite topic made in chat goes on a team the user leads, or is made private

## Impact

- `worker/prompts/chat-new-topic.md`: version 13, the teams block and steps 5 and 9.
- `api/tool/chatTools.ts`: the create tool's team check and `TEAM_MISSING_TEXT`.
- `evals/new-topic-chat/`: the leader team and the two cases.
- `docs/src/content/docs/feed/making-a-topic-in-chat.md`: the team step and the defaults line.
- The prompt is synced to Langfuse after deploy with `prompts:sync:prd`.
