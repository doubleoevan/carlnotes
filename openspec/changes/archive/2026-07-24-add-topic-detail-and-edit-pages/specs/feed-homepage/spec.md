## ADDED Requirements

### Requirement: The homepage offers topic creation beside Refresh
The homepage's control row SHALL show an Add Topic primary button beside Refresh, opening the shared topic modal in create mode. Under the button, a cap line ("N left" — the topic cap is on held topics, never per day) SHALL link to the pricing page with an "Upgrade for more" tooltip, hydrate in once the feed payload lands (with a same-height placeholder while loading), and the button SHALL be disabled while loading and at zero remaining. A successful create SHALL refresh the feed and navigate to the new topic's page.

#### Scenario: Creating a topic lands on its page
- **WHEN** the user saves the Add Topic modal within the cap
- **THEN** the topic is created and the app navigates to its detail page

#### Scenario: A reached topic cap disables the button
- **WHEN** the user holds as many topics as their cap allows
- **THEN** the cap line shows "0 left" and Add Topic is disabled

### Requirement: The homepage filters topics by tag
Below the control row and above the sections, the homepage SHALL show a tag filter built on the shared tag picker without tag creation: a "Tags:" text label leading the selected tag pills — solid like the topic tag pills — and a "+" opening the search picker over the feed's known tags. Far right in the same row, a Tag Filters button styled like the search bar's Filters control (same icon) SHALL open a menu of match modes — Any Match (default), All Match, Exclude Tags, and Off, the active one checked: with tags selected, sections narrow to topics carrying at least one, every one, or none of them respectively, while Off ignores the tag filter and shows every topic without clearing the selected pills; with no tags selected, all topics show regardless of mode. A filter or mode change SHALL replay the sections' entrance motion, like the other view filters.

#### Scenario: Selecting a tag narrows the sections
- **WHEN** the user selects a tag from the picker under the Any mode
- **THEN** every section shows only topics carrying that tag, and clearing the pills restores the full feed

#### Scenario: The match mode changes what the tags mean
- **WHEN** the user selects two tags and switches the mode to All, then to Exclude Tags
- **THEN** sections first narrow to topics carrying both tags, then to topics carrying neither

#### Scenario: Off ignores the tag filter
- **WHEN** the user has tags selected and switches the mode to Off
- **THEN** every topic shows again while the selected pills stay in place

#### Scenario: The homepage picker cannot create tags
- **WHEN** the user types text matching no known tag in the homepage picker
- **THEN** no Create row is offered
