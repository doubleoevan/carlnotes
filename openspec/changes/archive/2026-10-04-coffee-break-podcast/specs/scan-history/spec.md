## ADDED Requirements

### Requirement: A scan history row has a pill that plays the Podcast Episode that its Scan rendered

A scan history row whose Scan has a published Podcast Episode SHALL show that Podcast Episode's number as a pill, such
as `E14`, that plays the Podcast Episode, or pauses it while it plays. A row whose Scan rendered no Podcast Episode, or
whose Podcast Episode is still rendering or failed, SHALL show no pill. The pill SHALL follow the same access rule as
the player, so a subscriber of an invite Topic sees it only for a Podcast Episode published after they joined.

#### Scenario: A Scan with a Podcast Episode shows its number

- **WHEN** the scan history lists a Scan whose Podcast Episode published as number 14
- **THEN** its row shows `E14`, and selecting it plays that Podcast Episode

#### Scenario: A Scan with no Podcast Episode shows no pill

- **WHEN** the scan history lists a Scan that rendered no Podcast Episode
- **THEN** its row shows no podcast episode pill

### Requirement: The topic page lists Scan history five to a page

A `▾ Brew diary` accordion (default expanded) SHALL list the Topic's Scans newest first, five to a page, with a centered
row of page numbers under the card if the Topic has more than five Scans. The row SHALL be the same row of page numbers
that a homepage section and the podcast episodes card show, and a browser without JavaScript SHALL not show it. Each row
SHALL show the finish timestamp ("Jul 15 · 6:02 am"), a muted one-line stat ("read {foundCount} · kept {keptCount}" for
succeeded Scans, the status for running or failed ones), and a right-aligned ⓘ. The ⓘ popover SHALL show Carl's full
scan summary, then how long the Scan took ("{duration} taken"), appending the cost in cents from the Scan's stored spend
only if the user owns the Topic or holds the platform admin role. The api SHALL withhold the cost value from everyone
else instead of relying on the ui to hide it.

#### Scenario: History shows five Scans to a page

- **WHEN** a Topic has twelve Scans
- **THEN** the newest five rows show, and the row under the card shows pages 1, 2, and 3 with 1 highlighted

#### Scenario: A page number opens its page

- **GIVEN** a Topic with twelve Scans showing its first page
- **WHEN** a user presses 3
- **THEN** the card shows the two oldest Scans, and 3 is highlighted

#### Scenario: A history of five or fewer has no page numbers

- **WHEN** a Topic has four Scans
- **THEN** all four rows show and no row of page numbers

#### Scenario: An admin sees the scan cost

- **WHEN** a platform admin opens a succeeded Scan's ⓘ
- **THEN** the popover shows the full summary, how long the Scan took, and the cost in cents

#### Scenario: The owner sees the scan cost

- **WHEN** the Topic's owner opens a succeeded Scan's ⓘ
- **THEN** the payload includes the cost and the popover shows it, since spend on their own Topic is theirs to see

#### Scenario: A non-owner non-admin never receives the cost

- **WHEN** a signed-in non-owner who is not an admin loads the topic page and opens a Scan's ⓘ
- **THEN** the payload has no cost value and the popover shows the summary and how long the Scan took, but no cost

## REMOVED Requirements

### Requirement: The topic page lists Scan history

**Reason**: The brew diary shows five Scans a page under the shared row of page numbers, instead of ten with a
"+ N older" expander. The rest of the requirement moves to "The topic page lists Scan history five to a page", added
above.

**Migration**: None. Only the topic page shows the Scan history.
