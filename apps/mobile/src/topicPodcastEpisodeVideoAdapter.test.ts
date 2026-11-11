import { expect, mock, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { LoadPodcastEpisodeAudioOptions, PodcastEpisodeAudioEvent } from "@carlnotes/core/lib/podcastEpisodeAudio"
import {
	type TopicPodcastEpisodeVideoPlayerSource,
	toTopicPodcastEpisodeVideoAdapter,
} from "./topicPodcastEpisodeVideoAdapter"

// a fake expo-video player whose source turns ready on replace, and the call that sends an event to its listeners
function toVideoPlayerFixture(): {
	player: TopicPodcastEpisodeVideoPlayerSource
	emit: (eventName: string, payload?: unknown) => void
} {
	// the listeners by event name
	const listeners = new Map<string, Set<(payload: unknown) => void>>()
	const emit = (eventName: string, payload?: unknown): void => {
		for (const listener of listeners.get(eventName) ?? []) {
			listener(payload)
		}
	}

	// the player's calls as mocks. a source turns ready on the next tick, and null stays idle
	const player = {
		currentTime: 0,
		playbackRate: 1,
		play: mock(() => {}),
		pause: mock(() => {}),
		replaceAsync: mock(async (source: unknown) => {
			if (source) {
				queueMicrotask(() => emit("statusChange", { status: "readyToPlay" }))
			}
		}),
		addListener: mock((eventName: string, listener: (payload: unknown) => void) => {
			const eventListeners = listeners.get(eventName) ?? new Set()
			eventListeners.add(listener)
			listeners.set(eventName, eventListeners)
			return { remove: () => eventListeners.delete(listener) }
		}),
	}
	return { player: player as unknown as TopicPodcastEpisodeVideoPlayerSource, emit }
}

function toLoad(): LoadPodcastEpisodeAudioOptions {
	return { podcastEpisode: toPodcastEpisodeFixture(), positionSeconds: 45, playbackRate: 1.5, loadId: 1 }
}

test("the film adapter installs the authorized url with lock screen metadata at the saved second and speed", async () => {
	// an adapter on a fake player, recording its events
	const { player, emit } = toVideoPlayerFixture()
	const events: PodcastEpisodeAudioEvent[] = []
	const videoUrl = "https://media.example/film.mp4?X-Amz-Signature=private"
	const adapter = toTopicPodcastEpisodeVideoAdapter({
		player,
		onEvent: (event) => events.push(event),
		resolveVideo: async () => ({ videoUrl, expiresAt: "2099-01-01T00:00:00Z" }),
	})

	// a load installs the film url with its title, at the saved second and speed
	await adapter.load(toLoad())
	expect(player.replaceAsync).toHaveBeenLastCalledWith(
		expect.objectContaining({ uri: videoUrl, metadata: expect.objectContaining({ title: expect.any(String) }) }),
	)
	expect(player.currentTime).toBe(45)
	expect(player.playbackRate).toBe(1.5)

	// the film's events reach the shared player under the load
	emit("timeUpdate", { currentTime: 50 })
	emit("playingChange", { isPlaying: true })
	emit("playToEnd")
	expect(events).toEqual([
		{ type: "position", loadId: 1, positionSeconds: 50 },
		{ type: "playback", loadId: 1, isPlaying: true },
		{ type: "ended", loadId: 1 },
	])

	// an unload stops the events and drops the source
	adapter.unload()
	events.length = 0
	emit("timeUpdate", { currentTime: 60 })
	expect(events).toHaveLength(0)
	expect(player.replaceAsync).toHaveBeenLastCalledWith(null)
})

test("retirement discards a delayed film url without installing or playing it", async () => {
	// start a load, then retire it before its url arrives
	const { player } = toVideoPlayerFixture()
	const videoFile = Promise.withResolvers<{ videoUrl: string; expiresAt: string }>()
	const adapter = toTopicPodcastEpisodeVideoAdapter({
		player,
		onEvent: () => {},
		resolveVideo: () => videoFile.promise,
	})
	const pendingLoad = adapter.load(toLoad())
	adapter.unload()

	// the late url is never installed or played
	videoFile.resolve({ videoUrl: "https://media.example/retired.mp4", expiresAt: "2099-01-01T00:00:00Z" })
	await expect(pendingLoad).rejects.toThrow()
	expect(player.replaceAsync).not.toHaveBeenCalledWith(
		expect.objectContaining({ uri: "https://media.example/retired.mp4" }),
	)
	expect(player.play).not.toHaveBeenCalled()
})

test("an expired film url reloads at the current second before playing", async () => {
	// an adapter whose film urls are already expired
	const { player } = toVideoPlayerFixture()
	const resolveVideo = mock(async () => ({
		videoUrl: "https://media.example/film.mp4",
		expiresAt: "2000-01-01T00:00:00Z",
	}))
	const adapter = toTopicPodcastEpisodeVideoAdapter({ player, onEvent: () => {}, resolveVideo })

	// load, advance, and play: the play resolves a fresh url at the advanced second
	await adapter.load(toLoad())
	player.currentTime = 80
	await adapter.play()
	expect(resolveVideo).toHaveBeenCalledTimes(2)
	expect(player.currentTime).toBe(80)
	expect(player.play).toHaveBeenCalledTimes(1)
})
