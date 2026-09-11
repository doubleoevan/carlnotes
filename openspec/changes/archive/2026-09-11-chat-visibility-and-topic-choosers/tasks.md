## 1. Visibility in the draft

- [x] 1.1 Add `visibility` to `topicDraftPayload` in `shared/contracts.ts`, defaulting to `invite`, and to the UI's and the api's empty drafts
- [x] 1.2 Let `draftTopic` write it, name it in the draft summary and the prompt's draft block, and pass it through `createTopicFromDraft`
- [x] 1.3 Add the step to `chat-new-topic.md` v2, drop visibility from its defaults line, and sync the prompt
- [x] 1.4 Show it on the draft card
- [x] 1.5 Say `create_topic` takes it in the MCP tool description

## 2. The choosers

- [x] 2.1 Add `TopicEditorChoiceDialog` and `NewTopicDialog`
- [x] 2.2 Open `NewTopicDialog` from the home, activity, and profile pages' New Topic buttons
- [x] 2.3 Open the chooser from the topic page's Edit topic option, with the form as one choice

## 3. Docs and checks

- [x] 3.1 Update the making-a-topic and editing-a-topic docs pages
- [x] 3.2 `bun run check` green, the draft tests cover the visibility field
