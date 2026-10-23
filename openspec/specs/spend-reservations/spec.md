# spend-reservations Specification

## Purpose
TBD - created by archiving change reserve-spend-before-calls. Update Purpose after archive.
## Requirements
### Requirement: A call's largest cost is reserved before it runs

Before a chat turn, a voice turn's transcription, a spoken part of a reply, or a scored Resource runs, the app SHALL
estimate the call's largest possible cost at the rates in the budget module, from the input the call sends and the
call's output limit, and SHALL reserve that amount. The user budget is a soft limit: a call SHALL start while what is
spent plus every open reservation is below the budget, even if its maximum would take the month past it, and its
reservation then counts against what is left. A call SHALL be rejected once what is spent plus the open reservations
reach the budget, before anything posts, with the rejection wording the spent budget already uses. A user with budget
left is never rejected, a second call is rejected while a running first call holds the rest of the budget, and the month
passes the budget by at most about one call's maximum. A spoken part SHALL be rejected only once what is spent reaches
the budget, whatever the open reservations hold, since it speaks a reply whose chat turn already holds a reservation.
When the call ends, its reservation SHALL settle: the actual cost is recorded as spend and the reservation is removed,
so what was reserved above the actual cost returns to the remaining budget. When the call fails, the reservation SHALL
be released. A reservation SHALL expire on its own after the call kind's longest run plus a margin, so a process that
dies holding one never holds it for good.

#### Scenario: A call with budget left starts even if its maximum does not fit

- **WHEN** a user has sixty cents of budget left and starts a chat turn whose maximum is seventy-four cents
- **THEN** the turn reserves its maximum and runs

#### Scenario: A second call is rejected while the first is running

- **WHEN** a user's first chat turn is running and holds a reservation that took the rest of the budget, and the user
  starts a second turn on another replica
- **THEN** the second turn is rejected before it posts, and a turn started after the first releases runs

#### Scenario: A turn's own reservation never rejects its spoken reply

- **WHEN** a chat turn's reservation holds the rest of the user's budget and its reply is spoken while it still streams
- **THEN** each spoken part reserves and runs, and a spoken part is rejected only once the recorded spend reaches the
  budget

#### Scenario: Overshoot is bounded by one call's maximum

- **WHEN** several calls start at once against the same user's budget
- **THEN** each starts only while what is spent plus the open reservations is below the budget, so what they hold passes
  the budget by less than one call's maximum

#### Scenario: Settling returns the difference

- **WHEN** a turn reserved its maximum and ends at a quarter of it
- **THEN** the turn's cost is recorded as spend, the reservation is gone, and the remaining budget is lower by the
  actual cost alone

#### Scenario: A failed call releases its reservation

- **WHEN** a model call fails after reserving
- **THEN** the reservation is released and no spend is recorded for it

#### Scenario: A crashed process's reservation expires

- **WHEN** a process dies holding a reservation
- **THEN** the reservation stops counting after it expires, and the next read of the remaining budget no longer
  subtracts it

#### Scenario: A turn is rejected once the budget is reached

- **WHEN** what a user has spent plus their open reservations have reached the budget
- **THEN** the turn is rejected with the spent budget rejection before the chat message is stored, and no model is
  called

### Requirement: User reservations live in Redis and degrade to today's check

Open reservations for a user SHALL be kept in Redis, so every api and worker replica subtracts the same open amount, and
the reserve SHALL be one atomic operation: prune the expired, sum the open, compare against the remaining, add if it
fits. The spent figure the check reads SHALL be the app's own monthly sums of scan, chat, and podcast episode spend, the
figure every budget gate reads today, read once per request. When Redis is unreachable or the operation times out, the
gate SHALL fall back to today's check of spend against the budget and allow the call, never reject it, and the fallback
SHALL count as a Redis error on the minute line, the same degrade-not-stop rule as the other Redis paths.

#### Scenario: Replicas see one open amount

- **WHEN** a turn reserves on one replica and a second turn on another replica reads the remaining budget
- **THEN** the second read subtracts the first turn's reservation

#### Scenario: Redis down means today's check

- **WHEN** Redis is unreachable and a user under budget starts a chat turn
- **THEN** the turn runs under the spend-against-budget check alone, and the outage is counted on the minute line

### Requirement: A Scan reserves inside its own budget

A Scan's `Budget` SHALL carry the dollars its running Resources have reserved. Before a Resource enters the paid
section it SHALL reserve its largest cost at the fetch and scoring rates, and it SHALL start only while the spent and
reserved dollars together are below the Scan limit, even if its largest cost would take the Scan past it, so the
Resources running at once pass the limit by at most one Resource's largest cost. When the Resource's paid work ends, its
actual cost SHALL be charged and its reservation removed, and a Resource that fails SHALL release its reservation. The
budget checkpointed in heartbeat details SHALL carry settled spend only, and a budget resumed from a checkpoint SHALL
start with no open reservation. Podcast episodes SHALL keep their cutoff pause and SHALL NOT reserve.

#### Scenario: Four parallel items start only while budget is left

- **WHEN** four Resources are dispatched at once against a Scan budget with two and a half Resources' maximums left
- **THEN** three reserve and score, the fourth is deferred unscored, and the Scan passes its limit by less than one
  Resource's maximum

#### Scenario: A resumed budget holds no reservation

- **WHEN** a review attempt dies holding reservations and the next attempt resumes from its checkpoint
- **THEN** the resumed budget's spent dollars are the first attempt's settled spend, and its reserved dollars are zero

