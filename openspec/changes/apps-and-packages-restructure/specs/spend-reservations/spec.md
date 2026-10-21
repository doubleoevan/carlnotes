## ADDED Requirements

### Requirement: A call's largest cost is reserved before it runs

Before a chat turn, a voice turn's transcription, a spoken part of a reply, or a scored Resource runs, the app SHALL
estimate the call's largest possible cost at the rates in the budget module, from the largest input the call kind can
send and the call's output limit, and SHALL reserve that amount against what remains: the budget, less what is spent,
less every open reservation. A call whose maximum does not fit SHALL be refused before anything posts, with the
rejection wording the spent budget already uses. When the call ends, its reservation SHALL settle: the actual cost is
recorded as spend and the reservation is removed, so what was reserved above the actual cost returns to the remaining
budget. When the call fails, the reservation SHALL be released. A reservation SHALL expire on its own after the call
kind's longest run plus a margin, so a process that dies holding one never holds it for good.

#### Scenario: Two turns at once cannot both overspend

- **WHEN** a user with budget left for one turn's maximum starts two chat turns at once on two replicas
- **THEN** one turn reserves and runs, and the other is refused before it posts

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

#### Scenario: A turn whose maximum does not fit is refused

- **WHEN** a user's remaining budget is below a chat turn's maximum
- **THEN** the turn is refused with the spent budget rejection before the chat message is stored, and no model is called

### Requirement: User reservations live in Redis and degrade to today's check

Open reservations for a user SHALL be kept in Redis, so every api and worker replica subtracts the same open amount, and
the reserve SHALL be one atomic operation: prune the expired, sum the open, compare against the remaining, add if it
fits. The spent figure the check reads SHALL be the app's own monthly sums of scan, chat, and podcast episode spend, the
figure every budget gate reads today, read once per request. When Redis is unreachable or the operation times out, the
gate SHALL fall back to today's check of spend against the budget and allow the call, never refuse it, and the fallback
SHALL count as a Redis error on the minute line, the same degrade-not-stop rule as the other Redis paths.

#### Scenario: Replicas see one open amount

- **WHEN** a turn reserves on one replica and a second turn on another replica reads the remaining budget
- **THEN** the second read subtracts the first turn's reservation

#### Scenario: Redis down means today's check

- **WHEN** Redis is unreachable and a user under budget starts a chat turn
- **THEN** the turn runs under the spend-against-budget check alone, and the outage is counted on the minute line

### Requirement: A Scan reserves inside its own budget

A Scan's `Budget` SHALL carry the dollars its in-flight Resources have reserved, and a Resource SHALL enter the paid
section only if the spent and reserved dollars together, plus the Resource's largest cost at the fetch and scoring
rates, stay within the Scan limit. When the Resource's paid work ends, its actual cost SHALL be charged and its
reservation removed, and a Resource that fails SHALL release its reservation. The budget checkpointed in heartbeat
details SHALL carry settled spend only, and a budget resumed from a checkpoint SHALL start with no open reservation.
Podcast episodes SHALL keep their cutoff pause and SHALL NOT reserve.

#### Scenario: Four parallel items score only what fits

- **WHEN** four Resources are dispatched at once against a Scan budget with room for two Resources' maximums
- **THEN** two reserve and score, and two are deferred unscored

#### Scenario: A resumed budget carries no reservation

- **WHEN** a review attempt dies holding reservations and the next attempt resumes from its checkpoint
- **THEN** the resumed budget's spent dollars are the first attempt's settled spend, and its reserved dollars are zero
