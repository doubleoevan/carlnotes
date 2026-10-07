## Why

A podcast episode's page had no actions menu, so a user could not add the episode's topic to a team, share the
topic, or report an issue without first going back to the topic's page. And a topic page, the teams page, and the plans
page had no New Topic button.

## What Changes

- The episode page registers its actions: Add topic to team, which opens a dialog of the teams the user leads, Share topic,
  which opens the share dialog, Report issue, which reports the episode's topic, and Remove episode for whoever may
  remove the episode.
- Add topic to team shows only where Team Up would, for a signed-in user and never on someone else's private topic. The
  dialog lists the teams the user leads that hold the topic with a remove action, the user's other leader teams with an
  add action, and New team.
- Team Up's popover and the new dialog share one hook for loading the user's teams, adding and removing the topic, and
  the New team modal, and one options list.
- The episode page's topic includes its owning team, the holding teams that the user belongs to, and whether the user owns it.
- Whoever may remove an episode gets a remove button on the topic page's player card and Remove episode in the episode
  page's actions menu, beside the episodes card's existing button, all through one confirmation dialog. A removed
  episode no longer counts toward the free plan's one episode per topic, so the topic's next scan renders a new one.
- An episode picks its findings by score from the scan's new findings and the liked, bookmarked, and url Source page
  ones. A like, a bookmark, and a url Source's page each give a score bonus of 0.2, adding up, and the score stays at 1
  or below. A new finding wins a tie, and the new findings are still narrated first. A bookmarked finding within 0.2 of
  a scan's new findings can now take a place.
- The actions menu shows on every page, and offers New topic on every page without its own New Topic or Add Topic
  button. New topic opens the same new topic dialog that the buttons open, and sends a visitor to sign up first.
- The pages with a New Topic button share one hook for opening the new topic dialog, and one button.
- On a topic page, a signed-in user who may not scan gets New Topic as the call to action on the right. The left holds
  Join Team for a user on none of the topic's holding teams, on a topic that a public team owns, and otherwise Team Up.
  If Join Team holds the left, Team Up is Add topic to team in the actions menu.
- Removing a topic from a team shows an error toast if the removal fails, on every screen that removes one.
- No episode page has Open Graph audio tags. A shared episode link previews with its card and no play button, so a
  tap opens the episode's page, where a visitor can sign up.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-pages`: the episode page's actions menu offers Add topic to team, Share topic, Report issue, and Remove
  episode, and no episode page has Open Graph audio tags
- `topic-creation-chat`: every page offers a way to create a topic, with New topic in the actions menu where no New
  Topic button shows, and the New Topic button reaches the episode page and the topic page
- `mcp-install`: the actions menu, and its Add to AI option, shows on every page
- `teams`: the topic page's action row puts New Topic on the right for a signed-in user who may not scan
- `podcast-episode-rendering`: a removed episode no longer counts toward the free plan's one, the remove control is on
  the player and the episode page, and an episode picks its findings by score with its bonuses
- `authorization`: the gate counts only a rendering or published episode toward the free plan's one

## Impact

- `shared/contracts.ts`: the episode page's topic adds `team`, `roomTeams`, and `isTopicOwner`, and the episode page adds
  `canRemovePodcastEpisode`.
- `api/podcast/helpers.ts`: the episode page returns those fields.
- `ui/src/components/team/AddTopicToTeamButton.tsx` (renamed from `TeamUpButton.tsx`): the shared hook and options list,
  which the Team Up button now uses.
- `ui/src/components/team/AddTopicToTeamDialog.tsx`: the dialog the menu opens.
- `ui/src/components/topic/TopicEditorChoiceDialog.tsx`: the shared new topic dialog hook and New Topic button.
- `ui/src/components/search/PageActionMenu.tsx` and `ui/src/stores/pageActionsStore.ts`: the menu on every page and its
  New topic option.
- `ui/src/pages/`: the episode page's actions, and the home, activity, profile, team, and episode pages marking their
  own New Topic or Add Topic button.
- `ui/src/components/topic/TopicActions.tsx`, `ui/src/pages/TopicPage.tsx`, and
  `ui/src/components/team/JoinTeamButton.tsx`:
  the topic page's new row layout, its Add topic to team option, and Join Team's left-side style.
- `worker/podcast/planPodcastEpisode.ts` and `worker/review/score.ts`: the score bonuses, the pick, and the shared `clampScore`.
- `db/quotas.ts` and `worker/podcast/podcastEpisode.smoke.ts`: the free plan counts only rendering and published episodes.
- `ui/src/components/podcast/RemovePodcastEpisodeDialog.tsx`: the shared remove dialog and button, used by the
  episodes card, the player card, and the episode page.
- `shared/contracts.ts`, `api/share/pageHead.ts`, and `ui/src/lib/pageHead.ts`: the page head drops its audio url and
  the `og:audio` tags.
- `ui/AGENTS.md`: the remove dialog in the podcast components list.
- `ui/src/components/team/TeamMenuOptions.tsx`: the team options that both team menus share.
- `ui/src/components/team/InviteUserToTeamButton.tsx`, `ui/src/pages/ProfilePage.tsx`,
  `ui/src/clients/profileClient.ts`,
  `api/profiles.ts`, and `api/team/helpers.ts`: the profile page's team menu moves into its own component and reads the
  shared `ProfileTeamStatus` from `shared/contracts.ts`, at `/profiles/:userId/team-statuses`.
- `ui/src/clients/teamClient.ts`: removing a topic from a team returns whether it worked and shows the error toast, and
  `fetchLeaderTeams` serves the team menu and `ui/src/components/topic/TopicTeamSelect.tsx`.
- `ui/src/lib/styleClasses.ts`: `MENU_DIVIDER_CLASS`, which every menu's and options dialog's divider uses.
- `docs/src/content/docs/` and `README.md`: the quickstart, making a topic in chat, editing a topic in chat, teaming up,
  the podcast page, and the README's podcast section.
