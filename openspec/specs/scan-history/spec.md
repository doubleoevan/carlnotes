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
A `▶ Run now` control SHALL render for the owner only, above the title row, and SHALL trigger a real Scan of the Topic through the api. The Scan SHALL be recorded as manual, run without blocking the request, and appear in History (as running until it finishes). The api SHALL authorize the trigger through `isAllowed(user, "scan:manual", topic)`, which allows the owner or an admin and enforces the plan's daily scan limit; requests it rejects SHALL be rejected.

While a Scan runs, the control SHALL be replaced by a shimmering line reading "Carl is Brewing…", naming the same act the Brew trigger names, alongside the stop control that ends it.

#### Scenario: Run now starts a scan
- **WHEN** the owner activates Run now within quota
- **THEN** the api accepts, a manual Scan row is created, and History shows it

#### Scenario: An admin can run a manual Scan on any Topic
- **WHEN** an admin triggers a manual Scan on a Topic they do not own
- **THEN** the gate allows it and a manual Scan row is created

#### Scenario: A non-owner who is not an admin is rejected
- **WHEN** a user who is neither the owner nor an admin triggers a manual Scan
- **THEN** the api rejects it

#### Scenario: The running line names the brew
- **WHEN** a Scan is running on the topic page
- **THEN** the trigger is replaced by a shimmering "Carl is Brewing…"

### Requirement: Scans are quota-limited per user per day, by billing plan
Scans SHALL be limited per user per UTC day to the daily limit of the user's billing plan (free, plus, or premium), counted across every Scan on the user's Topics regardless of origin — scheduled and manual Scans share one pool. Only running and succeeded Scans SHALL count — a failed Scan gives its slot back, and so does a Scan the user stopped, which is counted by its `stoppedAt` rather than by its status. With a card on file the daily limit is soft: manual Scans beyond the daily limit SHALL be allowed and billed as metered overage (see `subscription-billing`); with no card it is a hard cap. Admins SHALL bypass the limit entirely. The Run-now block SHALL show "N left today" as a link to the pricing page whose tooltip reads "Upgrade for more"; at zero remaining the trigger SHALL be disabled and the api SHALL reject further manual Scans unless metered overage applies.

#### Scenario: Quota exhausts and rejects
- **WHEN** the owner has run as many Scans today as their plan allows and tries one more
- **THEN** the api rejects it, the display shows "0 left today", and the control is disabled

#### Scenario: A failed scan does not consume quota
- **WHEN** an owner's manual Scan finishes as failed
- **THEN** the remaining count no longer charges for it and the freed slot can be used again today

#### Scenario: A stopped scan does not consume quota
- **WHEN** an owner stops a running Scan
- **THEN** the remaining count no longer charges for it, even though the Scan closed as succeeded with the Findings it kept

#### Scenario: The daily limit gates manual Scans without a card
- **WHEN** a non-admin owner with no card on file has reached their plan's daily scan limit and triggers another manual Scan
- **THEN** the api rejects it as over the daily limit

#### Scenario: A card on file makes the daily limit soft
- **WHEN** a non-admin owner with a card on file has reached their plan's daily scan limit and triggers another manual Scan
- **THEN** the api starts it and bills the extra Scan as metered overage

#### Scenario: An admin bypasses the quota
- **WHEN** a platform admin triggers a manual Scan regardless of how many Scans ran today
- **THEN** the api starts it and the displayed count never reaches zero

### Requirement: A manual Scan is rejected before it starts if the key that it bills has spent its budget
After the gate allows a manual Scan, the api SHALL read the budget of the key that the Scan bills from the LiteLLM proxy before the api starts the Scan: the key's recorded spend and its maximum budget. The read is the same check that the scheduled sweep runs. A manual Scan bills the key of the user who requested it, the Topic owner's own or an admin's own, so that user's budget SHALL be the one read. If the key's spend has reached its maximum budget, the api SHALL reject the request with a 402 and the copy "Carl hit this month's coffee budget.", SHALL create no Scan row, SHALL run no Source, and SHALL bill no overage. The Topic page SHALL show that copy in an error toast with a See plans action. The Topic page's existing check of the app's recorded spend SHALL stay as it is: if that spend is already exhausted, the page shows its own out-of-budget copy with a See account action and sends no request. If the user has no key yet, or the read fails or times out, the Scan SHALL start as before.

#### Scenario: An over-budget owner's manual Scan is rejected
- **WHEN** the owner's key has spent its whole budget and the owner activates Run now
- **THEN** the api responds 402, no Scan row is created, no Source runs, and the page shows "Carl hit this month's coffee budget." with See plans

#### Scenario: A rejected Scan bills no overage
- **WHEN** an owner past their daily scan limit with a card on file triggers a manual Scan and their key's budget is spent
- **THEN** the Scan is rejected because of the budget and no overage is billed

#### Scenario: An admin's manual Scan checks the admin's own budget
- **WHEN** an admin triggers a manual Scan on a Topic whose owner's key has spent its budget, and the admin's own key has not
- **THEN** the Scan starts and bills the admin's key

#### Scenario: An unreadable budget starts the Scan
- **WHEN** the proxy does not answer the user's budget read in time
- **THEN** the manual Scan starts as before

