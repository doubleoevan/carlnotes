# Tasks

## 1. Annotation titles

- [x] 1.1 Set `annotations.title` to the tool's title on every tool under `apps/api/mcp/`
- [x] 1.2 Fail the directory contract check in `mcpContractTestFixtures.ts` on a missing or different
      `annotations.title`, and on annotations with neither `readOnlyHint` nor `destructiveHint`. Verify: `tools.test.ts`
      rejects each broken annotation

## 2. set_topic_image takes a url only

- [x] 2.1 Drop `image_prompt` from `topicImageTool.ts`, and return an error that names the topic page for a call with no
      `image_url`. Verify: `topicImageTool.test.ts` shows the error starts no render
- [x] 2.2 Update the tool description, the `add-to-ai.md` row, and the smoke section in
      `mcpTopicWriteSmokeSections.ts`

## 3. Registry and checks

- [x] 3.1 Bump `server.json` to 1.0.1
- [x] 3.2 Run preflight and the MCP contract tests
