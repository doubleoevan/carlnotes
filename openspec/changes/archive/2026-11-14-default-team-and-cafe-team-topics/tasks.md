# Tasks

## 1. Default team

- [x] 1.1 Add `apps/api/team/defaultTeam.ts` with `loadDefaultTeam`, `toDraftTeamWithDefault`, and
      `addTopicToDefaultTeamOnVisibilityChange`, and mark the default team in the teams summary
- [x] 1.2 Put a shared draft on the default team in the new-topic chat, drop `TEAM_MISSING_TEXT`, and list the default
      team first in the prompt's teams block
- [x] 1.3 Take an omitted `team` as the default team in MCP `create_topic`
- [x] 1.4 Apply the default team when the chat or MCP `edit_topic` switches a private Topic to public or invite, and
      name it in the saved line
- [x] 1.5 Start the form's Team field on the default team, and drop the form's Team requirement on web and mobile
- [x] 1.6 Rewrite `chat-new-topic.md` rules for the default team at version 17, and update the eval's team cases

## 2. Café team topics

- [x] 2.1 Widen the tiles' read to the Topics of led Teams, public Teams and Topics alone for a visitor
- [x] 2.2 Add the person's own table read over every Team they are an active member of, and `ownTopics` on the profile
- [x] 2.3 Count pins only on owned Topics, and limit the rank dialogs to owned public Topics
- [x] 2.4 Hide the owner's controls on rows the person does not own, and read the own table from the profile on web
      and mobile

## 3. Checks

- [x] 3.1 Tests for the default team, the form's starting team, the Café reads, and the rank candidates
- [x] 3.2 `bun run check`
