## 1. The draft
- [x] 1.1 Add `tags`, `frequency`, and `maxTopicFindings` to `topicDraftPayload` with the editor's defaults, and to the empty drafts and tests
- [x] 1.2 Let `draftTopic` write them, show them in the summary, the block, and the card, and save them in `createTopicFromDraft`
- [x] 1.3 Offer them in `chat-new-topic.md` v4

## 2. The edit
- [x] 2.1 Add `updateTopicFieldsPayload` and the `updateTopicFields` Topic Tool with the daily-frequency check
- [x] 2.2 Offer it in the edit chat and name it in `chat-edit-topic.md` v3
- [x] 2.3 Expose `update_topic_fields` on the MCP server

## 3. Docs and checks
- [x] 3.1 Update the two chat docs pages
- [x] 3.2 `bun run check` green, the smoke covers the new tool
