## MODIFIED Requirements

### Requirement: The info card and popover number the findings under Carl's Top N

The topic info SHALL render the Topic's Findings as a numbered list under the scan note, in the info card and the info
popover alike — the scan email's list in app form: the rank, the linked title, the host, and the model's relevance
explanation at the note's own size. The explanations read inline there, where the findings feed keeps them behind a
hover a phone does not have. The section SHALL be titled `Carl's Top N`, N the finding count, and fall back to `Carl's
Notes` when the Topic has none.

In the card, Read more SHALL expand the note and its findings into the bounded scroll box the popover already uses, with
Read less sitting just below the box, so the card keeps its height and collapsing never needs a page-scroll back. The
popover SHALL show the same content in its scroll box outright. The clip and its Read more SHALL exist only with
JavaScript, which measures the note, so a client with no JavaScript reads the whole note and the whole list with no
toggle.

The scan history's popover SHALL list the findings its own scan produced the same way, under that scan's note. Each
finding names its producing scan, so a scan's popover never borrows another scan's findings. A scan whose findings
are no longer among the topic's kept rows lists none.

#### Scenario: Expanding the card reveals the numbered findings

- **WHEN** a reader expands the info card's Read more on a Topic with Findings
- **THEN** the full note and the numbered finding list scroll together inside a bounded box, each entry linking its
  title and stating why Carl kept it, with Read less just below the box

#### Scenario: The popover carries the same list

- **WHEN** a reader opens the topic info popover on a Topic with Findings
- **THEN** its scroll box holds the note followed by the same numbered finding list, under the same Carl's Top N title

#### Scenario: A topic with no findings lists nothing

- **WHEN** the Topic has no Findings
- **THEN** the section stays titled Carl's Notes and renders the note alone, with no empty list under it

#### Scenario: The note shows whole without JavaScript

- **WHEN** a client with no JavaScript fetches a public Topic's page with a long scan note
- **THEN** the info card holds the whole note and the whole numbered list, unclipped, with no Read more
