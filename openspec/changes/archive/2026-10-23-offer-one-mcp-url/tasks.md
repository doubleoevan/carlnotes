## 1. One server url

- [x] 1.1 Remove `mcp` from the page actions in `apps/web/src/stores/pageActionsStore.ts`, and have
      `PageActionMenu.tsx` pass `{ name: "CarlNotes", url: <origin>/mcp }` to the dialog on every page.
- [x] 1.2 Remove the topic-bound server and its `useOrigin` call from `apps/web/src/pages/TopicPage.tsx`.
- [x] 1.3 Remove the `TopicServer` story from `AddToAiDialog.stories.tsx`, and point the install deeplink test's server
      at `/mcp`.
- [x] 1.4 Check in the dialog's Storybook story that the Claude steps and the Claude Code command name `/mcp`. The
      page actions type has no server field left, so the topic page opens the same dialog.

## 2. Docs

- [x] 2.1 Rewrite the "Two servers" section of `apps/docs/src/content/docs/account/add-to-ai.md` for one server, and
      retake the dialog's screenshot as `add-to-ai-dialog-claude.png`.
- [x] 2.2 Check `apps/web/AGENTS.md` for the page actions or the dialog's server. It names neither, so it stays.

## 3. Verify

- [x] 3.1 `bun run check` passes.
