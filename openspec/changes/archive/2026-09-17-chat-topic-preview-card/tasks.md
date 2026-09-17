## 1. Correct the drifting requirements

- [x] 1.1 `topic-tools`: the chat adapter binds four edit tools, not three
- [x] 1.2 `topic-tools`: Carl proposes through `proposeTopicEdit` instead of in prose, and the proposal tools sit outside the tools a consent may force
- [x] 1.3 `topic-tools`: the MCP adapter registers four edit tools
- [x] 1.4 `topic-creation-chat`: the card shows the loading while Carl replies instead of filling in mid-stream

## 2. Specify the preview card

- [x] 2.1 `topic-editing`: the card, what each of its two titles means, the name that links to the Topic, and the way out of a proposal
- [x] 2.2 `topic-editing`: a proposal rebuilt from the stored tool calls after a reload, and a cancelled one rebuilt as none
- [x] 2.3 `topic-creation-chat`: a team alone is not a draft, so the card hides after a create on a team page

## 3. End the conversation on a create

- [x] 3.1 `topic-creation-chat`: a created topic clears the stored draft and the conversation, after the turn is saved
- [x] 3.2 The reply announcing the create stays on screen

## 4. Verify

- [x] 4.1 `bun run check`, the repo gate: Biome, `tsc -b`, the Temporal workflow bundle check, and the test suite
- [x] 4.2 `openspec validate chat-topic-preview-card`
