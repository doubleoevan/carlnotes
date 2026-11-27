## Why

A user who has made a topic with Carl wants it created. The Suggested Reply showed nothing when the draft held invites,
and only allowed a yes instead of suggesting one, so the user typed an answer Carl already knew.

## What Changes

- Every proposal gets a suggestion, and at a proposal the suggestion is "Yes, create it": a public topic, a topic with
  invites, and a topic on the user's team alike.
- Sending "Yes, create it" creates the topic in that turn, with no second question.
- The suggestion still never names anyone to invite or agrees to a source nobody discussed.

## Capabilities

### Modified Capabilities

- `topic-creation-chat`: the new-topic suggestion says yes to every proposal. Two requirements are replaced, since each
  drops a scenario that said a proposal may go without one.

## Impact

- `apps/api/chat/chatTurnStream.ts` and `chatProposals.ts` (no proposal check), `packages/models/prompts/suggest-reply.md`
  (version 3), the stream tests, `evals/suggested-replies/`, and `apps/api/AGENTS.md`.
