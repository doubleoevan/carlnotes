## MODIFIED Requirements

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic in one SQL query, joining each Topic to the start of its last completed Scan and applying the frequency window in the query, so the sweep never loads a Topic that is not scheduled. For each scheduled Topic it starts a scheduled (non-manual) Scan through `startTopicScan`, which runs the Scan's Temporal workflow, and that workflow sends the topic-scan email once the Scan succeeds. The sweep SHALL run under a database claim: a sweep that starts while another holds the claim SHALL exit at once, having done nothing, and return null. A sweep SHALL be idempotent: a second sweep never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose Scan is still running, and a Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, skipped over budget, and could not start. A Topic counts as could not start if starting its Scan threw. A Scan that starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

#### Scenario: A scheduled Topic is scanned on its frequency

- **WHEN** a sweep runs and a Topic is scheduled by its frequency
- **THEN** a non-manual Scan starts for that Topic through `startTopicScan` and appears in the Topic's history

#### Scenario: Only scheduled Topics are loaded

- **WHEN** a sweep runs against a thousand Topics of which forty are scheduled
- **THEN** the sweep's query returns forty rows, and no Topic that is not scheduled is read into the process

#### Scenario: One Topic's failure does not abort the sweep

- **WHEN** starting one scheduled Topic's Scan throws
- **THEN** the error is logged and reported, the sweep continues, and the remaining scheduled Topics' Scans still start

#### Scenario: A start that throws is counted as could not start

- **WHEN** starting a scheduled Topic's Scan throws
- **THEN** the sweep summary counts that Topic under could not start instead of started

#### Scenario: The sweep is safe to run repeatedly

- **WHEN** a second sweep runs right after a first that started a Topic's Scan
- **THEN** no second Scan starts for that Topic

#### Scenario: A concurrent sweep exits

- **WHEN** a second sweep starts while a first still holds the claim
- **THEN** the second returns null without reading a Topic or starting a Scan

## ADDED Requirements

### Requirement: The sweep starts no Scan for an owner whose key budget is spent
Before it starts any Scans, the sweep SHALL read each scheduled Topic owner's key budget from the LiteLLM proxy once: the key's recorded spend and its maximum budget, which are the numbers that the proxy compares when it rejects a call. The reads SHALL run a few owners at a time, each under the five-second timeout on proxy admin calls. For an owner whose key's spend has reached its maximum budget, the sweep SHALL start no Scan for that owner's scheduled Topics, and no Source of those Topics SHALL run. Each of that owner's scheduled Topics SHALL instead get a Scan row with status `failed`, no dispatch, a cost of zero, and a reason that the budget failure check recognizes, so the Topic page shows the existing budget copy. A Topic whose Scan is still running SHALL get no row. The budget check SHALL come after the daily scan limit and the daily topic limit, so a Topic skipped for either of those gets no row. A Scan row that was opened earlier and never dispatched SHALL still be dispatched as before. The scheduled Topics of an owner with no key yet, or of an owner whose budget read fails or times out, SHALL be scanned as before. The ingest spend on Exa, TwitterAPI.io, and Firecrawl SHALL stay on the operator's account and SHALL NOT count toward the user's budget.

#### Scenario: An owner over budget gets no Scan
- **WHEN** a sweep runs and an owner's key has spent its whole budget
- **THEN** none of that owner's scheduled Topics start a Scan, none of their Sources run, and each Topic gets a failed Scan that the Topic page labels "Carl hit this month's coffee budget."

#### Scenario: The skip is recorded once per frequency window
- **WHEN** a sweep saved a failed Scan for a Topic because of the budget, and the next sweep runs inside that Topic's frequency window
- **THEN** the Topic is not selected, since the failed Scan counts as its last completed Scan

#### Scenario: A Topic with a running Scan gets no failed Scan row
- **WHEN** a sweep runs, an owner's key has spent its whole budget, and one of their scheduled Topics has a Scan still running
- **THEN** that Topic gets no failed Scan row and no second Scan starts

#### Scenario: An unreadable budget fails open
- **WHEN** the proxy does not answer an owner's budget read in time, or the owner has no key yet
- **THEN** that owner's scheduled Topics start their Scans as before

#### Scenario: Each owner's budget is read once a sweep
- **WHEN** one owner has several scheduled Topics in a sweep
- **THEN** the sweep reads that owner's budget once
