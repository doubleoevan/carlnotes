## Context

The Topic Draft is the one contract the new-topic chat, the draft card, `createTopicFromDraft`, and the MCP `create_topic` tool share, so a visibility field belongs on it and flows to every one of them. The chooser is the same question twice, once for a new topic and once for an edit, differing only in which chat it opens and which form it hands off to.

## Goals / Non-Goals

- Goals: visibility settable in the chat with the same three values as the editor; one chooser dialog reused by the New Topic buttons and the Edit topic option; the team page's Add Topic keeps opening the form, since the chat cannot put a topic on a team.
- Non-Goals: asking for the schedule or the results count in chat; remembering the user's last choice; changing the editor form.

## Decisions

- `topicDraftPayload.visibility` defaults to `invite`, so an older draft, an MCP call without it, and every existing test keep today's behavior. `draftTopic` takes it optional like every other draft field.
- The prompt asks for visibility after the sources and before the invites, so an invite-only answer leads straight into who to invite. The read-back names it.
- `TopicEditorChoiceDialog` takes an optional `topicId`: with one it opens the topic's private chat, without one the new-topic chat. `NewTopicDialog` wraps the chooser and the create form so each page swaps one component instead of growing a second state.
- The chooser opens the panel `open` on a wide screen and `enlarged` on a narrow one, as the empty-feed opener does.

## Risks / Trade-offs

- A user who picks Carl on the topic page lands in the private chat with no prompt to start from. Acceptable: the panel's empty state already explains what Carl can change.
