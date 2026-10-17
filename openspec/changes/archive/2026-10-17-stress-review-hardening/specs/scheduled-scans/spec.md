## MODIFIED Requirements

### Requirement: A sweep runs under a database claim

The sweep SHALL take a database claim before it does any work. The claim SHALL be a lease row in the `claims` table,
keyed by the claim's name, holding the holder's id, when it was taken, and when it expires. Taking the claim SHALL be
one statement that inserts the row, or takes the row over only if its lease has expired, and the expiry SHALL be
read from the database clock. While the sweep runs, the runner SHALL renew the lease well inside its expiry, and when
the sweep ends, however it ends, the runner SHALL delete the row only if it still holds it. No transaction SHALL stay
open between statements, so the claim works through the connection pooler and pins no server connection. A sweep that
cannot take the claim SHALL exit at once and return null. A renewal that finds the lease expired or held by another
holder SHALL abort the sweep through the abort signal the claim passes to it, and the sweep SHALL check that signal
between its stages and before each Topic it starts, so a sweep that lost its claim stops instead of running beside the
next one. A sweep that ends after losing its claim SHALL fail with an error naming the lost claim. A process that dies
SHALL leave a lease that expires on its own, short enough that a sweep killed at its job's time limit frees the claim
before the next scheduled sweep. The sweep SHALL keep no in-memory guard, since the sweep runs as a cron with one
process per invocation and a second process cannot see another's memory.

#### Scenario: Two crons overlap

- **WHEN** a cron starts a sweep while the previous cron's sweep still holds a live lease
- **THEN** the second takes no claim, reads no Topic, starts no Scan, and exits

#### Scenario: A dead sweep releases its claim

- **WHEN** a sweep's process dies mid-run
- **THEN** its lease expires within the lease length, and the next sweep takes the claim over

#### Scenario: A sweep that loses its lease stops

- **WHEN** a sweep's renewal finds that its lease expired and another sweep took the claim
- **THEN** the first sweep starts no further Scan and fails with an error naming the lost claim

#### Scenario: Releasing touches only the holder's own row

- **WHEN** a sweep that lost its claim ends while another sweep holds the claim
- **THEN** its release deletes nothing, and the other sweep's lease stands
