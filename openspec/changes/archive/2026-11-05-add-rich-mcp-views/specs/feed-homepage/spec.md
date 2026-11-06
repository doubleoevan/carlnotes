## MODIFIED Requirements

### Requirement: Resources are read/watch/listen rows limited to five with an expander
Each Topic SHALL list its Findings' Resources as rows, each with the Resource title, an ⓘ control, and source + age
meta, with dashed rules between rows. A row SHALL show no Resource kind icon. Activating a row SHALL open the Resource
link in a new tab. At most five rows SHALL show, with a "+ N more / show less" expander for the rest. Without JavaScript
the expander SHALL be a plain link to the Topic's page, where every Finding is in the html, and the expander button
SHALL be hidden. The Resource ⓘ popover SHALL show Carl's summary, a mark-read/unread control, and thumbs up/down.

#### Scenario: Only five resources show until expanded
- **WHEN** a Topic has more than five Findings in view
- **THEN** five Resource rows show with no Resource kind icon, and a "+ N more" expander reveals the rest

#### Scenario: The resource info popover shows summary, read state, and thumbs
- **WHEN** the user activates a Resource's ⓘ control
- **THEN** a popover shows Carl's summary, a mark-read/unread control, and thumbs up/down

#### Scenario: The expander is a link without JavaScript
- **WHEN** a client with no JavaScript reads a homepage card with more than five Findings
- **THEN** "+ N more" is a link to the Topic's page, and no button is shown
