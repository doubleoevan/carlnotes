## 1. The topic's team fields

- [x] 1.1 Add `team`, `roomTeams`, and `isTopicOwner` to the episode page's topic, and return them from the api

## 2. Team Up, shared

- [x] 2.1 Move Team Up's teams, its add and remove actions, and its New team modal into one hook, and its options into
  one list, and use both in Team Up
- [x] 2.2 Add the Add topic to team dialog over the same hook and list

## 3. The episode page

- [x] 3.1 Register Add topic to team, Share topic, and Report issue on the episode page, with the dialog and the share options
- [x] 3.2 Check the menu, the dialog, and the share options on the local stack, signed in and signed out

## 4. New topic on every page

- [x] 4.1 Move the pages' New Topic dialog state into one hook
- [x] 4.2 Show the actions menu on every page, with New topic unless the page marks its own New Topic or Add Topic button
- [x] 4.3 Mark the buttons on the home, activity, profile, team, and episode pages
- [x] 4.4 Update the quickstart, making a topic in chat, teaming up, and the podcast docs
- [x] 4.5 Check New topic on a topic page, the plans page signed out, and its absence on the home page

## 5. The topic page's row for a user who may not scan

- [x] 5.1 Put New Topic on the right, Join Team or Team Up on the left, and Team Up in the menu as Add topic to team if Join
  Team holds the left
- [x] 5.2 Share one New Topic button across the pages that show one
- [x] 5.3 Screenshot the row for a follower, a user who may join, the owner, and a visitor

## 6. Removing an episode

- [x] 6.1 Stop counting a removed episode toward the free plan's one, and flip the smoke check
- [x] 6.2 Share one remove dialog and button across the episodes card, the player card, and the episode page
- [x] 6.3 Return whether the user may remove the episode with the episode page, and offer Remove episode in its menu
- [x] 6.4 Check the player's button and the episode page's option on the local stack

## 7. Picking an episode's findings

- [x] 7.1 Pick by score, with a like, a bookmark, and a url Source's page each adding 0.2, adding up, up to 1, and a
  new finding first on a tie
- [x] 7.2 Test the pick, and replay a prod episode against it

## 8. Episode link previews

- [x] 8.1 Drop the `og:audio` tags and the page head's audio url, so a shared episode link opens its page

## 9. Team code

- [x] 9.1 Name the topic's and the profile's team menu code for what it does, with Team Up left as the buttons' label
- [x] 9.2 Share the team options and the profile team status type between the two menus and the api
- [x] 9.3 Show an error toast wherever removing a topic from a team fails
- [x] 9.4 Share the topic's menu options between its two pages, the leader teams fetch, and the menu divider class
