## 1. A yes to every proposal

- [x] 1.1 Remove the inviting-proposal check from `isSuggestedReplyTurn` in `apps/api/chat/chatTurnStream.ts` and delete `isInvitingProposal`; verify a public, an inviting, and a team proposal each get the call
- [x] 1.2 Have `packages/models/prompts/suggest-reply.md` suggest "Yes, create it" at a proposal, and bump it to version 3
- [x] 1.3 Expect a yes in the eval's proposal cases, and add a proposal with invites
- [x] 1.4 Update `apps/api/AGENTS.md`
