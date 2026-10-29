import { expect, test } from "bun:test"
import { toPublicPodcastEpisodeProperties } from "./visitAnalytics"

// keep protected identifiers out of playback and feed analytics on both platforms
test("podcast analytics attribute only public episodes", () => {
	const episode = { id: "episode", topicId: "topic" }
	expect(toPublicPodcastEpisodeProperties({ ...episode, topicVisibility: "public" })).toEqual({
		episodeId: "episode",
		topicId: "topic",
	})
	for (const topicVisibility of ["private", "invite"] as const) {
		expect(toPublicPodcastEpisodeProperties({ ...episode, topicVisibility })).toEqual({})
	}
})
