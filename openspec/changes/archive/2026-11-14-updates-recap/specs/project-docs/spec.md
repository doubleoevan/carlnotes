## MODIFIED Requirements

### Requirement: The deployment guide's Recovery section states what holds each kind of data and how it comes back

`apps/docs/deployment.md` SHALL hold a Recovery section after the Launch runbook with one part for each store:
Postgres, object storage, Redis, Temporal, LiteLLM's database, and the secrets `CHAT_TEXT_KEY` and
`BETTER_AUTH_SECRET`. Each part SHALL say what the store holds, what a loss costs, and how the data comes back. A
fact only a dashboard knows, such as a restore window, a plan, or a bucket's versioning, SHALL be marked as the
owner's to fill and never stated as fact.

#### Scenario: The Postgres part gives the steps and what a restore brings back

- **WHEN** an operator opens the Postgres part
- **THEN** it gives the steps of a restore, a `DATABASE_URL` change, a restart of every process, and the migration
  job, and lists what a restore brings back that it should not: rows people deleted after the restore time, which
  are deleted again inside the privacy page's 90 days, LiteLLM keys the proxy has retired, and Stripe events to send
  again, and it says that stored objects are not restored with it

#### Scenario: The object storage part sorts what comes back

- **WHEN** an operator opens the object storage part
- **THEN** it lists what comes back by itself, what comes back for a cost, and what is gone for good, such as an
  avatar, an attachment, an uploaded image, and a published Podcast Episode's audio

#### Scenario: The Redis part states what a loss and an outage cost

- **WHEN** an operator opens the Redis part
- **THEN** it lists what a loss of Redis's data costs beyond the buffered counts, the day's view claims, the day-long
  counts, the unused sign-up tokens, the day's recap, and the open spend reservations among them, and what an
  outage fails: an account close, which responds 503, and the nightly Dashboard build. It names what no test has
  confirmed: a sign-out during an outage may leave its session usable until that session's next refresh

#### Scenario: The two secrets are named

- **WHEN** an operator opens the secrets part
- **THEN** it says that neither `CHAT_TEXT_KEY` nor `BETTER_AUTH_SECRET` can be made again without losing data, and
  what each one protects

#### Scenario: A restore window is the owner's to fill

- **WHEN** the section reaches Neon's restore window or the bucket's versioning
- **THEN** it marks the value as the owner's to fill from the dashboard, and states no number of its own
