## Why

The topic card Carl edits beside a chat shipped ahead of its specs. Three requirements now describe behaviour the code
contradicts, so a reader trusting the specs would build the wrong thing:

- `topic-tools` says the chat turn offers "the three edit tools". It offers four: `updateTopicPrompt`, `addSource`,
  `removeSource`, and `updateTopicFields`.
- `topic-tools` says Carl "SHALL propose an edit in prose". He proposes by calling `proposeTopicEdit`, a tool that saves
  nothing and puts the topic's card in front of the reader. Neither it nor `cancelTopicEdit` appears in any spec.
- `topic-creation-chat` says the draft card "shows them before his reply finishes streaming". The card now shows the
  app's loading in place of its fields while Carl replies, and reveals them when the reply ends.

## What Changes

The specs are corrected to the shipped behaviour, and the preview card it describes is specified for the first time:
the tool pair that proposes and cancels a change, what the card is called in each chat, the loading it shows while
Carl replies, and the conversation ending with the topic it created.

No product behaviour changes. This change is the specs catching up to code that is already written and tested.

## Capabilities

### Modified Capabilities

- `topic-tools`: the edit tools are four, not three, and Carl proposes through `proposeTopicEdit` instead of in prose
- `topic-creation-chat`: the draft card shows the loading while Carl replies instead of filling in mid-stream, and a
  created topic ends the conversation that made it
- `topic-editing`: the topic card in a chat, what each of its two titles means, and the reader's way out of a proposal

## Impact

Specs only. The code, its tests, and the prompts are already in this change list:

- `api/tool/chatTools.ts` — `toChatTopicTools`, `toProposeTopicEditTool`, `toCancelTopicEditTool`
- `api/chat/turns.ts`, `api/chat/roomTurns.ts` — the tools bound per turn
- `ui/src/components/chat/TopicDraftCard.tsx`, `useEditableTopicDraft.ts`, `topicToolCalls.ts`
- `ui/src/components/chat/useTopicChat.ts` — the conversation ending on a create
- `worker/prompts/chat-edit-topic.md`
