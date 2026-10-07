## 1. Ask for the team

- [x] 1.1 In `worker/prompts/chat-new-topic.md`, say in the teams block that a public or invite topic goes on a team,
  make step 5 ask which team unless the draft is private or names one, make the topic private for no team, and
  include the team in step 9's read-back. Raise the version to 13
- [x] 1.2 In `api/tool/chatTools.ts`, return `TEAM_MISSING_TEXT` from the create tool for a public or invite draft
  with no team, before `createTopicFromDraft`

## 2. Tests, evals, and docs

- [x] 2.1 Test that the create tool asks for a team before it creates a public or invite topic
- [x] 2.2 Give the new-topic chat eval a leader team, put the finished draft on it, and add the cases for a public
  topic asking which team and a public topic with no team made private
- [x] 2.3 Update the team step and the defaults line in the making-a-topic-in-chat docs page
