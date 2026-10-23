// the viewer count seeds: one per topic or podcast episode, with each recorded person once
import { expect, test } from "bun:test"
import { toViewerCountSeeds } from "./viewerCountSeeds"

test("a person recorded twice for one topic is seeded once, and each ref gets its own seed", () => {
	const topicRef = { kind: "topic", id: "topic-1" } as const
	const podcastEpisodeRef = { kind: "podcastEpisode", id: "episode-1" } as const
	const viewerCountSeeds = toViewerCountSeeds([
		{ viewerCountRef: topicRef, userId: "owner-1" },
		{ viewerCountRef: topicRef, userId: "owner-1" },
		{ viewerCountRef: topicRef, userId: "subscriber-1" },
		{ viewerCountRef: podcastEpisodeRef, userId: "listener-1" },
	])
	expect(viewerCountSeeds).toEqual([
		{ viewerCountRef: topicRef, elements: ["u:owner-1", "u:subscriber-1"] },
		{ viewerCountRef: podcastEpisodeRef, elements: ["u:listener-1"] },
	])
})
