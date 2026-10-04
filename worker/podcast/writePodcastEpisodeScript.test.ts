// podcast episode script input tests: the module that loads a script's inputs never reads an attachment
import { expect, test } from "bun:test"

test("the script's inputs read the Topic's own name and prompt, never its attachments", async () => {
	// read the module's source, and check that it reads the Topic's prompt and no attachment
	const moduleText = await Bun.file(new URL("./writePodcastEpisodeScript.ts", import.meta.url)).text()
	expect(moduleText).not.toContain("buildTopicScanContext")
	expect(moduleText).not.toMatch(/\battachments\b.*from "\.\.\/\.\.\/db\/schema"/)
	expect(moduleText).toContain("topicPrompt: topic.prompt")
})
