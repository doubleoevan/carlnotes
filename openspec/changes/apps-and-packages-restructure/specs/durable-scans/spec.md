## MODIFIED Requirements

### Requirement: A retried stage resumes what the Scan already spent

What a stage has spent SHALL be checkpointed as it runs, so that a second attempt continues from the recorded totals
rather than from zero. A resumed attempt SHALL take the running totals — spend, the per-stage breakdown, and the fetch
outcome counts — from the checkpoint, and SHALL take its limits from a freshly built budget, because limits are read
from the environment and a checkpointed one would be stale. The checkpoint SHALL carry settled spend only: the dollars
an attempt's in-flight Resources had reserved and not yet charged are never checkpointed, and a resumed budget starts
with no open reservation.

A missing or malformed checkpoint SHALL fall back to the budget the stage was passed, rather than failing the stage.

#### Scenario: Review resumes after a worker death

- **GIVEN** a review attempt that spent against the Scan's budget and then died with its worker
- **WHEN** the next attempt starts
- **THEN** it continues from the recorded spend, per-stage costs, and fetch counts, so the finished Scan's cost includes
  the first attempt's spend

#### Scenario: A resumed stage does not regain its limits

- **GIVEN** a checkpoint recording that the Scan has already scored most of its allowed Resources
- **WHEN** the next attempt builds its budget from that checkpoint
- **THEN** the scored-resource limit and the spend limit come from the current configuration and count the
  already-scored Resources, rather than starting the allowance again

#### Scenario: A malformed checkpoint

- **WHEN** a stage starts with a checkpoint that is absent or does not match the expected shape
- **THEN** it uses the budget it was passed and runs normally

#### Scenario: A resumed budget holds no reservation

- **GIVEN** a review attempt that died while four Resources held reservations
- **WHEN** the next attempt builds its budget from the checkpoint
- **THEN** its spent dollars are the settled spend, its reserved dollars are zero, and the four Resources are scored or
  deferred by the limit anew
