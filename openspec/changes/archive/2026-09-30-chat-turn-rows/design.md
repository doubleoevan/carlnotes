## Context

`chat_turns` holds one row for every chat turn and every chat room turn, whether or not it keeps text. The specs
called that row a ledger row. A chat room turn's row fills `total_tokens` and a private chat turn's row does not,
because `total_tokens` arrived with team chat rooms and the private write path was never updated. Only the topic chat's
post route counts `chat_budget_reached`. The team chat and the new-topic chat reject a spent budget the same way but
count nothing.

## Goals / Non-Goals

**Goals:**
- Name the row a chat turn row, or a spend row where the point is what it bills, in every requirement that said
  ledger.
- Record the token total on every chat turn row.
- Count a spent budget's rejection on every private chat.

**Non-Goals:**
- No new analytics event, and no change to what `chat_budget_reached` includes.
- No backfill of `total_tokens` on existing private chat turn rows. Nothing reads the column yet.
- No sweep of these specs beyond the requirements this change restates. Inside those, the other rejected terms go
  too: viewer, refused, stamped, surface, tunes, and Coffee Talk.

## Decisions

- **One builder writes both spend columns.** A private chat turn's row and a chat room turn's row both take their cost
  and their token total from one function, so the two can never drift apart again. The alternative, adding
  `totalTokens` to the private row by hand, would leave two places to update the next time a spend column arrives.
- **The spent budget's outcome names its user.** The authorization outcome for a spent budget includes the user id,
  as the allowed outcome already does, so one rejection path can count the event for all three private chat routes.
  The alternative, reading the session again in each route, is what left the team and new-topic routes without the
  event.
- **The event keeps its `topicId` property.** A team chat's rejection sends the team id and the new-topic chat's sends
  an empty string, as `chat_turn_sent` already does, so the two conversation events stay comparable.

## Risks / Trade-offs

- [Private chat turn rows written before this change have no token total] → Nothing reads the column. A later report
  that needs history can derive it from the cost.
