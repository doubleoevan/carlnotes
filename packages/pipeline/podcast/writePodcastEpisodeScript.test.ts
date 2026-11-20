// podcast episode script tests: the module that loads a script's inputs never reads an attachment, and a recording
// that already saved its script writes no second one
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as generatePodcastEpisodeScript from "./generatePodcastEpisodeScript"
import * as podcastPersonalSourcesMigration from "./podcastPersonalSourcesMigration"
import { outlinePodcastEpisode, savePodcastEpisodeScript } from "./writePodcastEpisodeScript"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("the script's inputs read the Topic's own name and prompt, never its attachments", async () => {
	// read the module's source, and check that it reads the Topic's prompt and no attachment
	const moduleText = await Bun.file(new URL("./writePodcastEpisodeScript.ts", import.meta.url)).text()
	expect(moduleText).not.toContain("buildTopicScanContext")
	expect(moduleText).not.toMatch(/import\s*\{[^}]*\battachments\b[^}]*\}\s*from "@carlnotes\/db\/schema\//)
	expect(moduleText).toContain("topicPrompt: podcastEpisodeTopic.prompt")
})

// a saved script of two chapters, as the row of a recording that the reaper started again holds
const SAVED_SCRIPT = {
	coldOpen: [],
	segments: [
		{
			transition: [],
			chapters: [
				{ findingId: "finding-1", title: "A quieter grinder", turns: [{ speaker: "host", text: "One." }] },
				{ findingId: "finding-2", title: "Hard water", turns: [{ speaker: "cohost", text: "Two." }] },
			],
		},
	],
	signOff: [],
}

// the chapters that a recording already stored were recorded from its saved script, so nothing writes over it
test("a recording that saved its script outlines nothing and writes no second script", async () => {
	// the row's saved title, description, and script, and a model that would write an outline
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('"script" from "episodes"') ? [["A quieter grinder", "Burrs and water.", SAVED_SCRIPT]] : [],
	)
	const outlineSpy = spyOn(generatePodcastEpisodeScript, "generatePodcastEpisodeOutline")
	spyOn(podcastPersonalSourcesMigration, "assertPodcastPersonalSourcesConverted").mockResolvedValue(undefined)

	// the outline plans no segment, so the workflow writes none, and no model is called
	const scriptCallOptions = { podcastEpisodeId: "episode-1", topicId: "topic-1", billedUserId: "owner-1" }
	const outline = await outlinePodcastEpisode({ ...scriptCallOptions, plannedFindings: [] })
	expect(outline).toEqual({ title: "A quieter grinder", description: "Burrs and water.", segments: [] })
	expect(outlineSpy).not.toHaveBeenCalled()

	// the save keeps the saved script and returns its two chapters
	expect(await savePodcastEpisodeScript("episode-1", [])).toBe(2)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})
