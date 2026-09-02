## ADDED Requirements

### Requirement: The share sheet distinguishes sharing from inviting

A share sheet SHALL name what each option sends. An option that shares the page SHALL say so, and the option that mints an invitation SHALL say so, so that a leader reading the sheet can tell which link grants access.

The invite option SHALL be offered to anyone who may invite, whether or not the browser has a native share sheet, falling back to the clipboard when no sheet is available. The one option that grants access SHALL NOT be the one that disappears.

#### Scenario: The copy options name what they copy

- **WHEN** someone who may invite opens a team's share sheet
- **THEN** the option copying the team page and the option copying an invitation are distinguishable by their labels

#### Scenario: Inviting works without a native share sheet

- **WHEN** someone who may invite opens the sheet in a browser with no native share sheet
- **THEN** the invite option is still offered, and choosing it puts an invite URL on the clipboard

#### Scenario: A visitor who cannot invite is offered no invitation

- **WHEN** someone who may not invite opens the sheet
- **THEN** no invite option appears, and the sharing options are unchanged
