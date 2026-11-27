## Why

Public topics are how CarlNotes gets content. Carl already offers public first when he asks who should see a new
topic, but the Suggested Reply pushes the other way: it suggests keeping the topic private, and it shows nothing when
the draft is public. The suggestion should back Carl's offer.

## What Changes

- When Carl asks who should see the topic, the suggestion suggests making it public.
- A proposal of a public topic, or of an edit that makes a topic public, gets a suggestion such as "Yes, create it".
- A proposal that would invite anyone still gets no suggestion, and the suggestion still never names anyone to invite,
  since an invite emails another person.
- Accepting a suggestion still sends nothing. Only the user's own sent message agrees to a proposal.

## Capabilities

### Modified Capabilities

- `topic-creation-chat`: the new-topic suggestion suggests public, and only an inviting proposal skips the call.

## Impact

- `packages/models/prompts/suggest-reply.md` (version 2), `apps/api/chat/chatProposals.ts` (`isInvitingProposal`),
  `apps/api/chat/chatTurnStream.ts`, their tests, `evals/suggested-replies/`, and the docs that state the rule.
