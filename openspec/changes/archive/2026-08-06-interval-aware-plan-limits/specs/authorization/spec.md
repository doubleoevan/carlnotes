## MODIFIED Requirements

### Requirement: The plans catalog is an additive, rank-ordered capability map

The plans catalog SHALL define `free`, `plus`, and `premium`, each with an integer `rank` and a capability map holding the topic limit, the daily topic limit, the daily scan limit, the monthly spend backstop, and price. A higher-rank plan SHALL inherit every capability of the plans below it and MAY raise a limit. These limits SHALL live as configuration, not as literals scattered through call sites.

A limit that differs by billing interval SHALL be typed per interval rather than as a single number, so every read site has to name the interval it means. The daily topic limit and the daily scan limit SHALL both be per-interval. A user with no subscription SHALL resolve as monthly, since a free plan is billed on no other frequency.

The yearly interval SHALL carry limits at least as high as monthly for the same plan, because a yearly subscription cannot carry metered overage: its ceiling is hard where a monthly one's is soft.

The monthly spend backstop SHALL be set against the plan's own revenue, so that a fully utilized user costs approximately nothing.

#### Scenario: A higher tier inherits and raises limits
- **WHEN** the catalog is resolved for `premium`
- **THEN** premium's limits are at least those of `plus` and `free`, and any raised limit is read from config

#### Scenario: The gate resolves entitlements from the effective plan
- **WHEN** `isAllowed(user, capability, resource)` evaluates an entitlement for a non-admin
- **THEN** it reads the limit from the user's effective plan's capability map and answers from that value

#### Scenario: A per-interval limit names its interval at every read
- **WHEN** a caller reads the daily topic limit or the daily scan limit
- **THEN** it must supply a billing interval to get a number, so a yearly subscriber can never silently read a monthly subscriber's limit

#### Scenario: A user with no subscription reads monthly
- **GIVEN** a free user, who has no billing subscription
- **WHEN** their limits are resolved
- **THEN** they resolve at the monthly interval

#### Scenario: Yearly is never the lesser interval
- **WHEN** any plan's two intervals are compared
- **THEN** the yearly daily-topic and daily-scan limits are greater than or equal to the monthly ones

### Requirement: Manual scans are gated by the daily scan limit, soft with a card on file

`isAllowed(user, "scan:manual", topic)` SHALL enforce the effective plan's daily scan limit **at the user's billing interval**, counted per user per UTC day across the user's Topics (the shared scheduled-and-manual pool). Whether that ceiling is hard or soft SHALL follow the metered-overage rule in `subscription-billing` — soft with a card on file and a subscription that carries the overage price, hard otherwise; an admin SHALL bypass it.

A manual Scan SHALL be charged to the user who started it, not to the Topic's owner. The Scan's recorded owner, which is what the daily count and the monthly spend sum read, SHALL be the acting user, and the Scan's model calls SHALL bill that user's LiteLLM key. For an owner scanning their own Topic these are the same person. For an admin scanning a Topic they do not own, the Topic owner's daily quota and monthly budget SHALL be untouched, so an admin's Scan can never make the owner's own scheduled Scans skip for quota.

A scheduled Scan SHALL remain charged to the Topic's owner, since no user started it.

#### Scenario: An admin sees the scan control on a Topic they do not own

- **WHEN** an admin opens a Topic owned by someone else
- **THEN** the page reports a remaining count and shows the scan control, and a reader who may not scan is given no count and no control

#### Scenario: A manual scan within the daily limit is allowed
- **WHEN** a non-admin owner has run fewer scans this UTC day than their plan's daily scan limit at their interval
- **THEN** the gate allows the manual Scan

#### Scenario: A manual scan at the daily limit is gated
- **WHEN** a non-admin owner has reached their plan's daily scan limit at their interval
- **THEN** the gate denies the manual Scan unless the metered-overage rule makes the ceiling soft, while an admin is never denied

#### Scenario: A yearly subscriber reads the yearly limit
- **GIVEN** two users on the same plan, one billed monthly and one yearly
- **WHEN** each runs manual scans
- **THEN** the yearly subscriber's daily allowance is the yearly number, not the monthly one

#### Scenario: An admin's scan does not draw down the owner's quota
- **WHEN** an admin runs a manual Scan on a Topic they do not own
- **THEN** the Scan is recorded against the admin, the Topic owner's remaining scans for the day are unchanged, and the owner's monthly spend does not move

#### Scenario: An owner's own scan is charged to them
- **WHEN** a Topic's owner runs a manual Scan on their own Topic
- **THEN** the Scan is recorded against that owner, exactly as before

#### Scenario: An admin's scan cannot suppress the owner's scheduled scans
- **WHEN** an admin runs manual Scans on a free-plan user's Topics and the sweep later runs
- **THEN** that user's own Topics are still scanned, because the admin's Scans never entered their daily pool

## ADDED Requirements

### Requirement: A daily topic limit caps how many Topics run on a daily frequency

The plans catalog SHALL carry a daily topic limit per billing interval, and the gate SHALL enforce it against the number of the user's Topics whose frequency is a daily frequency.

This is the limit that decides whether a monthly budget survives the month. A Topic scanning daily costs roughly seven times one scanning weekly, so the topic limit alone says almost nothing about spend, and a user who schedules every Topic daily exhausts their budget partway through the month against a limit they were never shown.

A `weekdays` Topic SHALL count against this cap exactly as a `daily` one does. It costs about a quarter less, but one cap is far easier to explain than a weighted one, and under-consuming the budget is the safe direction to err.

An admin SHALL bypass it, as with every other quota.

The limit SHALL bind the Topics that already exist, not only the ones being written. The scheduled sweep SHALL scan only as many of an owner's daily-frequency Topics as their plan allows, taking the ones they have held longest and skipping the rest. Without this the limit would be decorative for anything already there: an owner who downgrades, or who held the Topics before the limit existed, would keep every one of them scanning daily forever. Ordering by age rather than arbitrarily means the same Topics keep their frequency from one sweep to the next, instead of a different subset going quiet each day.

#### Scenario: A user at the daily topic limit is refused

- **GIVEN** a non-admin whose Topics already fill their plan's daily topic limit at their interval
- **WHEN** they try to put another Topic on a daily frequency
- **THEN** the gate refuses, and no Topic's frequency changes

#### Scenario: Weekdays counts as a daily frequency

- **GIVEN** a user whose daily topic limit is 1, already used by a `weekdays` Topic
- **WHEN** they set a second Topic to `daily`
- **THEN** the gate refuses, because both frequencies draw on the same cap

#### Scenario: A weekly topic is never capped

- **WHEN** a user sets any number of Topics to `weekly`
- **THEN** the daily topic limit does not apply, and only the plan's total topic limit does

#### Scenario: An admin bypasses the cap

- **WHEN** an admin sets a Topic to a daily frequency past any plan's limit
- **THEN** it is allowed

#### Scenario: The sweep holds existing Topics to the limit

- **GIVEN** an owner whose plan allows one daily Topic and who holds three, after a downgrade
- **WHEN** the scheduled sweep runs
- **THEN** it scans the oldest of the three and skips the other two, and it skips the same two on the next sweep

#### Scenario: A weekly Topic is never skipped by the sweep

- **WHEN** the sweep reaches a Topic on a weekly frequency
- **THEN** the daily topic limit does not apply to it, however many daily Topics its owner holds

#### Scenario: An admin's Topics are never skipped by the sweep

- **WHEN** the sweep reaches an admin's daily Topics
- **THEN** all of them are scanned, since an admin bypasses the limit here as everywhere else
