## ADDED Requirements

### Requirement: An editor edits a Podcast Episode from its page

A Podcast Episode page's actions menu SHALL offer Edit podcast to a user the edit gate grants `topic:edit` on its
Topic. It SHALL open a dialog laid out like Edit topic, with Title, Description, the Image block, and Cancel and
Save. Save SHALL store the trimmed title and description within their limits after the text moderation. The api SHALL
respond 404 to anyone else, and the mobile episode menu SHALL offer the same action.

#### Scenario: An editor renames a Podcast Episode

- **WHEN** a Topic's editor opens Edit podcast, changes the title, and saves
- **THEN** the dialog closes and the page shows the new title

#### Scenario: A follower sees no Edit podcast

- **WHEN** a follower who may not edit the Topic opens the Podcast Episode page's actions menu
- **THEN** the menu offers no Edit podcast

#### Scenario: An empty title is not saved

- **WHEN** a Topic's editor clears the title and presses Save
- **THEN** the dialog stays open, names the missing title, and nothing is saved
