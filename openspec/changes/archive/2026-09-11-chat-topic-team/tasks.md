## 1. The team on the draft

- [x] 1.1 Add `team` to `topicDraftPayload`, the empty drafts, and the draft tests
- [x] 1.2 Let `draftTopic` write it, name it in the draft summary and block, and have `createTopicFromDraft` add the created topic to it
- [x] 1.3 Load the leader teams with the new-topic chat's authorization and write them into the prompt as `{{teamsBlock}}`
- [x] 1.4 Add the team step to `chat-new-topic.md` v3
- [x] 1.5 Show the team on the draft card, and say `create_topic` takes it

## 2. The team page

- [x] 2.1 Carry `initialTeam` on the new-topic chat id and page, and write it onto the draft
- [x] 2.2 Open the chooser from the team page's New topic option with the team seeded

## 3. Docs and checks

- [x] 3.1 Update the making-a-topic docs page
- [x] 3.2 `bun run check` green, the smoke covers a rejected team add
