# monthly-budget-cutoffs Specification

## Purpose
TBD - created by archiving change talk-from-the-podcast-player. Update Purpose after archive.
## Requirements
### Requirement: Each plan stops kinds of spend at shares of the monthly budget
Each plan SHALL set a monthly budget cutoff for each kind of spend it stops before the budget runs out, as a share of
the user's monthly budget, so the daily Scans the plan allows are paid for last:

| Cutoff | Free | Plus | Premium |
| --- | --- | --- | --- |
| Spoken questions | 15% | 40% | 50% |
| Full Podcast Episodes, which turn short | none | 60% | 70% |
| Podcast Episodes | 20% | 75% | 85% |
| Daily Scans, which turn weekly | moves | moves | moves |
| Manual Scans | 90% | 90% | 90% |

A cutoff SHALL be passed once the month's spend is at or past its share of the budget. Every check SHALL read the same
monthly spend sum that the spend meter and every other budget check read. An admin with no budget override SHALL have
no cutoffs. An admin with an override SHALL have the cutoffs of their plan, since the override is a deliberate limit.

#### Scenario: A plus user's spoken questions pause at 40 percent
- **GIVEN** a plus user with no daily Topics whose spend this month is $5.99 of a $15 budget
- **WHEN** their spend reaches $6.00
- **THEN** the spoken questions cutoff is passed, and no other cutoff is

#### Scenario: An admin with no budget override has no cutoffs
- **GIVEN** an admin with no budget override whose spend this month is $950
- **WHEN** any cutoff is checked
- **THEN** none is passed

### Requirement: Spoken questions pause at the spoken questions cutoff
Past the spoken questions cutoff, the transcription route SHALL reject a recording with a 402 and the error `spoken
questions paused` before it transcodes or transcribes anything. A signed-in user SHALL be able to read the status of
their spoken questions at `GET /api/chat/spoken-questions`: `budget` once the monthly budget is spent, checked first
since a spent budget is always past the cutoff, `paused` past the spoken questions cutoff, and `allowed` otherwise.
Every mic, in Coffee Talk, a team's chat room, and the podcast player, SHALL read it when tapped, before it asks for
the microphone, while the recorder loads beside the read. A mic that listen mode reopens after Carl's spoken answer
SHALL start recording at once and read the status beside the recording, and on `budget` or `paused` it SHALL cancel
the recording before anything is sent. A read that fails counts as allowed, and the transcription's own check still
applies. A mic SHALL send nothing on `budget` or `paused`.
On `budget` it SHALL show the chat's spent budget rejection, and a podcast mic whose own check already toasted the spent
budget SHALL show nothing more. On `paused`, a mic SHALL act as follows. On the free and plus plans it SHALL open the
plans page, which toasts "Upgrade to speak with Carl" for a chat mic and "Upgrade to speak with Carl and Vienna" for the
podcast player's mic. On premium, which has no plan above it, it SHALL toast "Speak with Carl again on the 1st." or
"Speak with Carl and Vienna again on the 1st." and stay on the page. A transcription rejected by the cutoff SHALL do the
same. Typed questions and the play button on an answer SHALL keep working until the budget is spent.

#### Scenario: A paused chat mic opens the plans page
- **GIVEN** a plus user whose spend is past 40 percent of their budget
- **WHEN** they tap the Coffee Talk mic
- **THEN** no microphone is asked for, and the plans page opens with the toast "Upgrade to speak with Carl"

#### Scenario: A premium user's paused podcast mic stays on the page
- **GIVEN** a premium user whose spend is past 50 percent of their budget
- **WHEN** they tap the podcast player's mic
- **THEN** no microphone is asked for, and the toast "Speak with Carl and Vienna again on the 1st." shows

#### Scenario: A reopened mic past the cutoff cancels its recording
- **GIVEN** a plus user in listen mode whose spend passes 40 percent of their budget during Carl's spoken answer
- **WHEN** listen mode reopens the mic after the answer
- **THEN** the recording is cancelled, nothing is transcribed, and the plans page opens with the toast "Upgrade to
  speak with Carl"

#### Scenario: A typed question past the spoken questions cutoff is answered
- **GIVEN** a plus user whose spend is past 40 percent of their budget and under 100 percent
- **WHEN** they type a question in Coffee Talk
- **THEN** Carl answers it

### Requirement: Podcast Episodes go short, then pause, at their cutoffs
Past the full Podcast Episodes cutoff, a Topic on a paid plan SHALL record short Podcast Episodes, which replace the
Topic's earlier short ones and never its full ones. Past the Podcast Episodes cutoff, no Podcast Episode SHALL be
recorded for the billed user until the next month. Scans SHALL keep running.

#### Scenario: Past 60 percent on plus, the Podcast Episode is short
- **GIVEN** a plus user whose spend this month is $9.00 of a $15 budget
- **WHEN** their Topic's Scan succeeds with Findings to narrate
- **THEN** its Podcast Episode is recorded short

#### Scenario: Past 75 percent on plus, the Scan runs and the Podcast Episode does not
- **GIVEN** a plus user whose spend this month is $11.25 of a $15 budget
- **WHEN** their Topic's scheduled Scan succeeds
- **THEN** the Scan is saved and emailed as usual, and no Podcast Episode is recorded

#### Scenario: Past 20 percent on the free plan, the Podcast Episode is not recorded
- **GIVEN** a free user whose spend this month is $0.60 of a $3 budget
- **WHEN** their Topic's Scan succeeds
- **THEN** the Scan is saved as usual, and no Podcast Episode is recorded

### Requirement: Daily Topics scan weekly past the daily Scans cutoff
The daily Scans cutoff SHALL sit where the rest of the budget only covers the daily Scans left this month: one minus
the cost of those Scans over the budget, never below zero. That cost SHALL be the user's daily Topics within their daily
topic limit, at the mean cost of the user's latest 20 succeeded Scans that were not started by hand or at the average
Scan cost without any, each daily Topic for each day until the next month starts and each weekdays Topic for each
weekday. A user with no daily Topics SHALL have no such
cutoff. Past it, the scheduled sweep SHALL skip a daily or weekdays Topic that has a Scan that succeeded in the past
seven days, and count it as skipped past the daily Scans cutoff. The sweep MAY act on an owner's cutoff result read up
to an hour earlier in the same UTC month. An owner whose cutoff cannot be read SHALL be reported, and their Topics SHALL
scan daily, still stopped by the spent budget check that the sweep runs for every owner.

#### Scenario: Past the cutoff, a daily Topic that scanned this week waits
- **GIVEN** a daily Topic that scanned three days ago, whose owner's spend is past the daily Scans cutoff
- **WHEN** the scheduled sweep runs
- **THEN** the Topic starts no Scan

#### Scenario: Past the cutoff, a daily Topic that has not scanned this week scans
- **GIVEN** a daily Topic whose last Scan that succeeded was eight days ago, whose owner's spend is past the cutoff
- **WHEN** the scheduled sweep runs
- **THEN** the Topic's Scan starts

#### Scenario: A weekdays Topic reserves only weekdays
- **GIVEN** a plus user with one weekdays Topic at a mean of 8 cents a Scan
- **WHEN** the cutoff is read on Tuesday October 20, with nine weekdays left
- **THEN** the daily Scans left cost 72 cents, and a manual Scan's cost never joins the mean

#### Scenario: The cutoff climbs through the month
- **GIVEN** a plus user with three daily Topics at a mean of 8 cents a Scan
- **WHEN** the cutoff is read on October 20, with twelve days left
- **THEN** it sits at about 81 percent of the budget, and later in the month it sits higher

### Requirement: Manual Scans pause at the manual Scans cutoff
Past the manual Scans cutoff and short of the whole budget, a manual Scan SHALL be rejected with a 402 and the label
"Manual brews are paused until the 1st. Scheduled brews keep running." before the key is read, a Scan row is written,
or overage is reported, and scheduled Scans SHALL keep running. At or past the whole budget, a manual Scan SHALL
instead be rejected with the spent budget label, "Carl hit this month's coffee budget.", checked before the cutoff,
because a spent budget stops scheduled Scans too. The topic payload's `isManualScanPaused` SHALL say the spend is past
the cutoff and `isSpendExhausted` that the budget is spent. In place of a Scan, the brew button SHALL show "You are
out of budget this month." for a spent budget and the paused label otherwise, each with a "See account" action. A
Topic's first Scan, started when the Topic is created, SHALL count as manual: past the cutoff it SHALL fail without
starting, with a stored reason that reads as the paused label and a "See account" link, and at a spent budget it SHALL
fail with the spent budget reason.

#### Scenario: A manual Scan past 90 percent is rejected
- **GIVEN** a plus user whose spend this month is $13.50 of a $15 budget
- **WHEN** they press Brew on their Topic
- **THEN** no Scan starts, nothing is billed, and the brew button says manual brews are paused until the 1st

#### Scenario: A manual Scan at a spent budget is not called paused
- **GIVEN** a plus user whose spend this month is $15 of a $15 budget
- **WHEN** they press Brew on their Topic
- **THEN** no Scan starts, nothing is billed, the rejection carries the spent budget label, and the brew button says
  they are out of budget this month

#### Scenario: A new Topic's first Scan past 90 percent does not start
- **GIVEN** a plus user whose spend this month is $13.50 of a $15 budget
- **WHEN** they create a Topic
- **THEN** the Topic is saved, its first Scan fails without billing anything, and the Topic page shows the paused label
  with a "See account" link

### Requirement: The plans page shows each plan's cutoffs
The plans page SHALL show a "Feature windows" table in a card of its own, on its own row under the plan cards, with
every row on one page. It SHALL have a row for each cutoff in the order the plans stop them and a last row for the spent
fund at 100 percent, and a column for each plan. Each cell SHALL read the plan's share from the plan config, "Always
short" for full Podcast Episodes on the free plan, and "Moves each day" for daily Scans. The docs page on plans and
limits SHALL keep the same table in its markdown, so the docs search reads its numbers, and a test SHALL fail if the
two tables differ in any cell.

#### Scenario: A changed share fails the docs check
- **GIVEN** a plan's Podcast Episodes share changed in the plan config
- **WHEN** the tests run before the docs table is updated
- **THEN** the docs table test fails and names the cell that differs

#### Scenario: The table needs no pagination
- **WHEN** a visitor opens the plans page on a phone
- **THEN** every row of the feature windows table shows, and the plan columns scroll beside the frozen first column

### Requirement: An empty dollar setting reads as unset

A dollar setting, `SCAN_BUDGET_USD` or `GLOBAL_DAILY_SPEND_ALERT_USD`, SHALL read as its default if it is unset or set
to an empty string, and as the number of dollars it holds otherwise. A value that is not a number of zero or more
dollars SHALL throw an error naming the setting and the value, so an empty value is never read as zero dollars.

#### Scenario: An empty setting keeps its default

- **GIVEN** `SCAN_BUDGET_USD` set to an empty string
- **WHEN** the per-Scan budget is read
- **THEN** it is the default of 50 cents, not zero

#### Scenario: A word is an error

- **GIVEN** `GLOBAL_DAILY_SPEND_ALERT_USD` set to `ten`
- **WHEN** the setting is read
- **THEN** an error names the setting and the value it got

### Requirement: A LiteLLM key replacement stores the new key only over the key it read

When the monthly budget reset or a plan or budget change replaces a user's LiteLLM key, the new key SHALL be stored
only if the user's row still holds the key the replacement read: the update matches the user and the old key. If no
row matches, because another replacement stored its key first or the row is gone, the replacement SHALL delete its own
new key from the proxy, keep the key the row holds, and SHALL NOT report the lost race as a failed replacement. Once the
new key is stored, the old key SHALL be deleted from the proxy, and a delete the proxy refuses is reported and does not
fail the replacement.

#### Scenario: Two replacements race

- **GIVEN** two replacements for one user that both read the same old key
- **WHEN** the second one's update runs after the first stored its key
- **THEN** the second's update matches no row, its new key is deleted from the proxy, and the user keeps the first's key

#### Scenario: An uncontested replacement stores and retires

- **WHEN** a replacement's update finds the row still holding the old key
- **THEN** the new key is stored and the old key is deleted from the proxy

