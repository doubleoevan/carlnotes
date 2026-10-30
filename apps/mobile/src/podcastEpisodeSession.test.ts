import { afterEach, expect, mock, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import {
	playPodcastEpisode,
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
	toLoadedPodcastEpisode,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import type { PodcastEpisodeCheckpointStore } from "./podcastEpisodeCheckpoint"
import { registerPodcastEpisodeCheckpoint, toPodcastEpisodeExit } from "./podcastEpisodeSession"

afterEach(() => mock.restore())

test("session exit pauses immediately, preserves a cancelled exit, and never clears a new account", async () => {
	// bind an inert player and the original account's checkpoint
	let loadId = 0
	const pause = mock(() => {})
	const unregister = registerPodcastEpisodeAudioAdapter({
		load: (options) => {
			loadId = options.loadId
		},
		play: () => reportPodcastEpisodeAudioEvent({ type: "playback", loadId, isPlaying: true }),
		pause,
		seek: () => {},
		setPlaybackRate: () => {},
		unload: () => {},
		updateMetadata: () => {},
	})
	const oldClear = mock(async () => {})
	const store: PodcastEpisodeCheckpointStore = {
		read: async () => null,
		save: () => {},
		clear: oldClear,
		retire: () => {},
		forget: async () => {},
	}
	const unregisterOld = registerPodcastEpisodeCheckpoint(store)
	try {
		await playPodcastEpisode(toPodcastEpisodeFixture())
		const finish = toPodcastEpisodeExit()
		expect(pause).toHaveBeenCalledTimes(1)
		await finish(false)
		expect(oldClear).not.toHaveBeenCalled()
		expect(toLoadedPodcastEpisode()?.id).toBe("episode-1")
		// let a different account take ownership before the old sign-out finishes
		const newClear = mock(async () => {})
		const unregisterNew = registerPodcastEpisodeCheckpoint({ ...store, clear: newClear })
		await playPodcastEpisode(toPodcastEpisodeFixture({ id: "new-account-episode" }))
		await finish(true)
		expect(oldClear).toHaveBeenCalledTimes(1)
		expect(newClear).not.toHaveBeenCalled()
		expect(toLoadedPodcastEpisode()?.id).toBe("new-account-episode")
		unregisterNew()
	} finally {
		unregisterOld()
		unregister()
	}
})
