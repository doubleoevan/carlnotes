## Context

`createTopic` takes no team. The form creates the topic and then calls the add-to-team route once per chosen team, and `addTopicToTeam` allows that for a leader alone. The chat path follows the same two steps on the server, inside `createTopicFromDraft`, so the MCP `create_topic` gets it for free.

## Goals / Non-Goals

- Goals: Carl asks which team, one team per draft, the team page seeds it, the card shows it, a rejected add is said in a toast and to Carl.
- Non-Goals: several teams in one draft (the topic page's Team Up adds more), the team form's own New topic option (it opens a form over a form, and the chat would sit behind the modal), asking about teams the user is a member of but does not lead.

## Decisions

- The draft's `team` holds the id and the name together, so the card and Carl's summary need no lookup, and the chooser seeds it from the same `{ teamId, name }` the create form's `initialTeam` already takes. The server trusts the id alone.
- The teams Carl may offer come from `loadTeamSummaries` filtered to the leader role, loaded with the new-topic chat's authorization, and written into the prompt as a data block.
- The team travels to the chat on the new-topic `ChatId` as `initialTeam`, so `isSameChat` still treats every new-topic chat as one conversation, and `useTopicChat` writes it onto the draft when it arrives.
- The step sits after visibility and before invites, so "which team" comes right after "who may read it".

## Risks / Trade-offs

- A team that stops being led between the draft and the yes gets the forbidden rejection: the topic exists, the toast says the add failed, and the topic page's Team Up is the way forward.
