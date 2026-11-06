## MODIFIED Requirements

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic in one SQL query, joining
each Topic to the start of its last completed Scan and applying the frequency window in the query, so the sweep never
loads a Topic that is not scheduled. Until the sweep has started as many Scans as its dispatch limit allows, it starts a
scheduled (non-manual) Scan for each scheduled Topic through `startTopicScan`, which runs the Scan's Temporal workflow,
and that workflow sends the topic-scan email once the Scan succeeds. The sweep SHALL run under a job lease: a sweep
that starts while another holds the lease SHALL exit at once, having done nothing, and return null. A sweep SHALL be
idempotent: a second sweep never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose
Scan is still running, and a Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic
failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary
of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, skipped over budget,
skipped over the backlog, and could not start. A Topic counts as could not start if starting its Scan threw. A Scan that
starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

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

- **WHEN** a second sweep starts while a first still holds the lease
- **THEN** the second returns null without reading a Topic or starting a Scan

## REMOVED Requirements

### Requirement: A sweep runs under a database claim

**Reason**: Its heading used a rejected term, and a MODIFIED block cannot rename a scenario.
**Migration**: `A sweep runs under a job lease` holds the same rule.

## ADDED Requirements

### Requirement: A sweep runs under a job lease

The sweep SHALL take a job lease before it does any work. The lease SHALL be a row in the `job_leases` table, keyed
by the job's name, holding the holder's id, when it was taken, and when it expires. The runner SHALL renew the lease
while the sweep runs. No transaction SHALL stay open between statements, so the lease works through the connection
pooler and pins no server connection. The sweep SHALL keep no in-memory guard.

#### Scenario: Two crons overlap

- **WHEN** a cron starts a sweep while the previous cron's sweep still holds a live lease
- **THEN** the second takes no lease, reads no Topic, starts no Scan, exits at once, and returns null

#### Scenario: Taking the lease is one statement

- **WHEN** a sweep takes the lease
- **THEN** one statement inserts the row, or takes the row over only if its lease has expired, and the expiry is read
  from the database clock

#### Scenario: The lease renews inside its expiry

- **WHEN** a sweep runs
- **THEN** the runner renews the lease well inside its expiry

#### Scenario: A dead sweep releases its lease

- **WHEN** a sweep's process dies mid-run
- **THEN** its lease expires within the lease length, which is short enough that a sweep killed at its job's time limit
  frees the lease before the next scheduled sweep, and the next sweep takes the lease over

#### Scenario: A sweep that loses its lease stops

- **WHEN** a sweep's renewal finds that its lease expired and another sweep took the lease
- **THEN** the renewal aborts the first sweep through the abort signal the lease passes to it, the first sweep checks
  that signal between its stages and before each Topic it starts, and it starts no further Scan and fails with an
  error naming the lost lease

#### Scenario: Releasing touches only the holder's own row

- **WHEN** a sweep ends, however it ends, while another sweep holds the lease
- **THEN** its release deletes nothing, and the other sweep's lease stands
