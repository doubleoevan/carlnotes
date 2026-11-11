import { expect, test } from "bun:test"
import { toPlayerVisitEvent, toPublicPodcastEpisodeProperties } from "./visitAnalytics"

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

// a discussion in the player reports its own play, and nothing as a podcast episode
test("a Topic Post Discussion's play is its own event by ids, and its finish reports nothing", () => {
	const discussion = { id: "topic-post-discussion:post-1:discussion-1", topicId: "topic-1" }
	expect(toPlayerVisitEvent("visit_episode_played", { ...discussion, topicVisibility: "public" })).toEqual({
		event: "social_topic_post_discussion_play",
		properties: { objectId: "post-1", topicId: "topic-1" },
	})
	expect(toPlayerVisitEvent("visit_episode_completed", { ...discussion, topicVisibility: "public" })).toBeNull()

	// a private Topic's discussion reports its play with no ids
	expect(toPlayerVisitEvent("visit_episode_played", { ...discussion, topicVisibility: "private" })).toEqual({
		event: "social_topic_post_discussion_play",
		properties: {},
	})

	// a podcast episode keeps its own events
	const episode = { id: "episode-1", topicId: "topic-1", topicVisibility: "public" as const }
	expect(toPlayerVisitEvent("visit_episode_completed", episode)).toEqual({
		event: "visit_episode_completed",
		properties: { episodeId: "episode-1", topicId: "topic-1" },
	})
})
