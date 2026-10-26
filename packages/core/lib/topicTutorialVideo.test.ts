import { expect, test } from "bun:test"
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import { toTopicTutorialPlayProperties, toTutorialPlayRecorder } from "./topicTutorialVideo"

test("only the first actual play in an opening records an event", () => {
	// opening, buffering, pausing, and later resumes are not additional plays
	const events: string[] = []
	const record = toTutorialPlayRecorder(() => events.push("played"))
	for (const state of ["unstarted", "buffering", "paused"]) {
		record(state)
	}
	expect(events).toEqual([])
	for (const state of ["playing", "paused", "playing"]) {
		record(state)
	}
	expect(events).toEqual(["played"])
	toTutorialPlayRecorder(() => events.push("reopened"))("playing")
	expect(events).toEqual(["played", "reopened"])
})

test("mobile openers share the web video's identity", () => {
	expect(toTopicTutorialPlayProperties("mobile-header")).toMatchObject({
		opener: "mobile-header",
		youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId,
	})
	expect(toTopicTutorialPlayProperties("mobile-settings").opener).toBe("mobile-settings")
})
