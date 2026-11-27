## 1. Suggest public

- [x] 1.1 Change `packages/models/prompts/suggest-reply.md` to suggest making the topic public at the visibility step, and bump it to version 2
- [x] 1.2 Replace `isPublishingOrInvitingProposal` with `isInvitingProposal` in `apps/api/chat/chatProposals.ts`, so only an inviting proposal skips the call; verify the stream tests
- [x] 1.3 Change the eval's visibility case to expect public, and add a public proposal case that may get a yes
- [x] 1.4 Update the docs page, `packages/models/AGENTS.md`, `apps/api/AGENTS.md`, and the domain-model skill
