## ADDED Requirements

### Requirement: Resources are read/watch/listen rows limited to five with an expander
Each Topic SHALL list its Findings' Resources as rows typed by Resource kind — read, watch, or listen — each with a
matching type icon, the Resource title, an ⓘ control, and source + age meta, with dashed rules between rows.
Activating a row SHALL open the Resource link in a new tab. At most five rows SHALL show, with a "+ N more / show
less" expander for the rest. Without JavaScript the expander SHALL be a plain link to the Topic's page, where every
Finding is in the html, and the expander button SHALL be hidden. The Resource ⓘ popover SHALL show Carl's summary, a
mark-read/unread control, and thumbs up/down.

#### Scenario: Only five resources show until expanded
- **WHEN** a Topic has more than five Findings in view
- **THEN** five Resource rows show, each bearing its read/watch/listen type icon, and a "+ N more" expander reveals the
  rest

#### Scenario: The resource info popover shows summary, read state, and thumbs
- **WHEN** the user activates a Resource's ⓘ control
- **THEN** a popover shows Carl's summary, a mark-read/unread control, and thumbs up/down

#### Scenario: The expander is a link without JavaScript
- **WHEN** a client with no JavaScript reads a homepage card with more than five Findings
- **THEN** "+ N more" is a link to the Topic's page, and no button is shown

## MODIFIED Requirements

### Requirement: The homepage opens the section that has something in it
For a signed-in user the homepage SHALL open the "Your topics" section first, except when the user owns no Topic and
follows at least one, when it SHALL open "Your subscribed topics" instead. A visitor SHALL still see the featured Topics
first. A closed section SHALL be in the html and SHALL show without JavaScript, so a reader who cannot open it still
reads it, and SHALL hide with JavaScript until opened.

#### Scenario: A follower who owns nothing lands on what they follow
- **WHEN** a user who follows a Topic but owns none loads the homepage
- **THEN** "Your subscribed topics" is the open section

#### Scenario: An owner lands on their own topics
- **WHEN** a user who owns a Topic loads the homepage
- **THEN** "Your topics" is the open section, whatever they follow

#### Scenario: A closed section shows without JavaScript
- **WHEN** a client with no JavaScript loads a visitor's homepage
- **THEN** the Popular section's topics are shown under the open Featured section, and a browser with JavaScript sees
  them only once the section is opened

## REMOVED Requirements

### Requirement: Resources are read/watch/listen rows capped with an expander

**Reason**: Renamed, since "capped" is a retired word, and the requirement gains the expander's link without
JavaScript.

**Migration**: "Resources are read/watch/listen rows limited to five with an expander" keeps both scenarios, with the
popover scenario reworded, and adds the link without JavaScript.
