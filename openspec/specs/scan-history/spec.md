# scan-history Specification

## Purpose
TBD - created by archiving change add-topic-detail-and-edit-pages. Update Purpose after archive.
## Requirements
### Requirement: The topic page lists Scan history
A `▾ History` accordion (default expanded) SHALL list the Topic's Scans newest first, capped at ten with a "+ N older" expander. Each row SHALL show the finish timestamp ("Jul 15 · 6:02 am"), a muted one-line stat ("read {foundCount} · kept {keptCount}" for succeeded Scans, the status for running or failed ones), and a right-aligned ⓘ. The ⓘ popover SHALL show Carl's full scan summary, then how long the Scan took ("{duration} taken"), appending the cost in cents from the Scan's stored spend only when the viewer owns the Topic or holds the platform admin role — the api SHALL withhold the cost value from everyone else rather than relying on the ui to hide it.

#### Scenario: History caps at ten
- **WHEN** a Topic has twelve Scans
- **THEN** ten rows show newest first and "+ 2 older" reveals the rest

#### Scenario: An admin sees the scan cost
- **WHEN** a platform admin opens a succeeded Scan's ⓘ
- **THEN** the popover shows the full summary, how long the Scan took, and the cost in cents

#### Scenario: The owner sees the scan cost
- **WHEN** the Topic's owner opens a succeeded Scan's ⓘ
- **THEN** the payload carries the cost and the popover shows it, since spend on their own Topic is theirs to see

#### Scenario: A non-owner non-admin never receives the cost
- **WHEN** a signed-in non-owner who is not an admin loads the topic page and opens a Scan's ⓘ
- **THEN** the payload carries no cost value and the popover shows the summary and how long the Scan took, but no cost

### Requirement: The owner can trigger a manual Scan
A `▶ Run now` control SHALL render for the owner only, above the title row, and SHALL trigger a real Scan of the Topic through the api. The Scan SHALL be recorded as manual, run without blocking the request, and appear in History (as running until it finishes). Requests from non-owners SHALL be rejected.

#### Scenario: Run now starts a scan
- **WHEN** the owner activates Run now within quota
- **THEN** the api accepts, a manual Scan row is created, and History shows it

### Requirement: Scans are quota-limited per user per day, by billing plan
Scans SHALL be limited per user per UTC day to the daily limit of the user's billing plan (Free, Plus, or Pro), counted across every Scan on the user's Topics regardless of origin — scheduled and manual Scans share one pool. Only running and succeeded Scans SHALL count — a failed Scan gives its slot back. Admins SHALL bypass this quota entirely. The Run-now block SHALL show "N left today" as a link to the pricing page whose tooltip reads "Upgrade for more"; at zero remaining the trigger SHALL be disabled and the api SHALL reject further manual Scans.

#### Scenario: Quota exhausts and rejects
- **WHEN** the owner has run as many Scans today as their plan allows and tries one more
- **THEN** the api rejects it, the display shows "0 left today", and the control is disabled

#### Scenario: A failed scan does not consume quota
- **WHEN** an owner's manual Scan finishes as failed
- **THEN** the remaining count no longer charges for it and the freed slot can be used again today

#### Scenario: An admin bypasses the quota
- **WHEN** a platform admin triggers a manual Scan regardless of how many Scans ran today
- **THEN** the api starts it and the displayed count never reaches zero

