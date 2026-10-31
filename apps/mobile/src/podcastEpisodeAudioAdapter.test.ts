import { expect, mock, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { PodcastEpisodeRequestError } from "@carlnotes/client/podcastEpisodeClient"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { LoadPodcastEpisodeAudioOptions, PodcastEpisodeAudioEvent } from "@carlnotes/core/lib/podcastEpisodeAudio"
import { toAudioPlayerFixture } from "./audioPlayerTestFixtures"
import { toPodcastEpisodeAudioAdapter } from "./podcastEpisodeAudioAdapter"

function toLoad(): LoadPodcastEpisodeAudioOptions {
	return { podcastEpisode: toPodcastEpisodeFixture(), positionSeconds: 45, playbackRate: 1.5, loadId: 1 }
}

test("the audio adapter passes only a media URI and preserves position, rate, and chapter commands", async () => {
	const { player, emit } = toAudioPlayerFixture()
	const events: PodcastEpisodeAudioEvent[] = []
	const audioUrl = "https://media.example/audio.mp3?X-Amz-Signature=private"
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: (event) => events.push(event),
		onAccessDenied: mock(() => {}),
		checkAccess: async () => toPodcastEpisodeFixture(),
		resolveAudio: async () => ({ audioUrl, expiresAt: "2099-01-01T00:00:00Z" }),
	})

	// a load installs the media uri at the saved position, rate, and chapters
	await adapter.load(toLoad())
	expect(player.replace).toHaveBeenLastCalledWith({ uri: audioUrl })
	expect(player.seekTo).toHaveBeenCalledWith(45, 0, 0)
	expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5)
	expect(player.setChapterTargets).toHaveBeenCalledWith([
		{ startSeconds: 0, title: "Chapter 1" },
		{ startSeconds: 60, title: "Chapter 2" },
	])

	// a play reports playback, and an unload stops the events
	await adapter.play()
	emit({})
	expect(events).toContainEqual({ type: "playback", loadId: 1, isPlaying: true })
	adapter.unload()
	events.length = 0
	emit({})
	expect(events).toHaveLength(0)
})

test("retirement discards a delayed source without installing or playing it", async () => {
	const { player } = toAudioPlayerFixture()
	const source = Promise.withResolvers<{ audioUrl: string; expiresAt: string }>()
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: () => {},
		onAccessDenied: () => {},
		resolveAudio: () => source.promise,
	})
	const pending = adapter.load(toLoad())
	adapter.unload()
	source.resolve({ audioUrl: "https://media.example/retired.mp3", expiresAt: "2099-01-01T00:00:00Z" })
	await expect(pending).rejects.toThrow()
	expect(player.replace).not.toHaveBeenCalledWith({ uri: "https://media.example/retired.mp3" })
	expect(player.play).not.toHaveBeenCalled()
})

test("confirmed access denial unloads but a transient failure leaves retry available", async () => {
	for (const status of [404, 503]) {
		const { player } = toAudioPlayerFixture()
		const denied = mock(() => {})
		const adapter = toPodcastEpisodeAudioAdapter({
			player,
			onEvent: () => {},
			onAccessDenied: denied,
			resolveAudio: async () => {
				throw new PodcastEpisodeRequestError(status)
			},
		})
		await expect(adapter.load(toLoad())).rejects.toThrow()
		expect(denied).toHaveBeenCalledTimes(status === 404 ? 1 : 0)
	}
})

test("an expired source resumes at the latest position and rate without exposing session headers", async () => {
	// advance an old source, then resolve a fresh URI when playback resumes
	const { player, emit } = toAudioPlayerFixture()
	const resolveAudio = mock(async () => ({
		audioUrl: "https://media.example/first.mp3",
		expiresAt: "2000-01-01T00:00:00Z",
	}))
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: () => {},
		onAccessDenied: () => {},
		resolveAudio,
		checkAccess: async () => toPodcastEpisodeFixture(),
	})
	await adapter.load(toLoad())
	emit({ currentTime: 82, playing: false })
	adapter.setPlaybackRate(2)

	// the resume installs the fresh uri at the latest position and rate
	resolveAudio.mockResolvedValue({ audioUrl: "https://media.example/refreshed.mp3", expiresAt: "2099-01-01T00:00:00Z" })
	await adapter.play()
	expect(player.replace).toHaveBeenLastCalledWith({ uri: "https://media.example/refreshed.mp3" })
	expect(player.seekTo).toHaveBeenLastCalledWith(82, 0, 0)
	expect(player.setPlaybackRate).toHaveBeenLastCalledWith(2)
	expect(player.play).toHaveBeenCalledTimes(1)
	adapter.unload()
})

test("a formerly public episode cannot resume after its visibility denies access", async () => {
	// reject a still-valid signed source when the episode has become private
	const { player } = toAudioPlayerFixture()
	const onAccessDenied = mock(() => {})
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: () => {},
		onAccessDenied,
		resolveAudio: async () => ({ audioUrl: "https://media.example/public.mp3", expiresAt: "2099-01-01T00:00:00Z" }),
		checkAccess: async () => {
			throw new PodcastEpisodeRequestError(404)
		},
	})

	// the resume's access check denies the play
	await adapter.load(toLoad())
	await expect(adapter.play()).rejects.toThrow()
	expect(player.play).not.toHaveBeenCalled()
	expect(onAccessDenied).toHaveBeenCalledTimes(1)
	adapter.unload()
})

test("pause and retirement prevent delayed protected access checks from starting playback", async () => {
	for (const shouldRetire of [false, true]) {
		// pause or retire while a protected resume is waiting on authorization
		const { player } = toAudioPlayerFixture()
		const access = Promise.withResolvers<ReturnType<typeof toPodcastEpisodeFixture> | null>()
		const adapter = toPodcastEpisodeAudioAdapter({
			player,
			onEvent: () => {},
			onAccessDenied: () => {},
			resolveAudio: async () => ({ audioUrl: "https://media.example/private.mp3", expiresAt: "2099-01-01T00:00:00Z" }),
			checkAccess: () => access.promise,
		})

		// start a private podcast episode's resume
		await adapter.load({ ...toLoad(), podcastEpisode: toPodcastEpisodeFixture({ topicVisibility: "private" }) })
		const pending = adapter.play()
		if (shouldRetire) {
			adapter.unload()
		} else {
			adapter.pause()
		}

		// the access check resolves after the pause or the unload, and nothing plays
		access.resolve(toPodcastEpisodeFixture())
		await pending
		expect(player.play).not.toHaveBeenCalled()
		adapter.unload()
	}
})

test("an unloaded or interrupted platform status does not count as a second playback start", async () => {
	// keep buffering and ordinary pause transitions distinct from a finished episode
	const { player, emit } = toAudioPlayerFixture()
	const events: PodcastEpisodeAudioEvent[] = []
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: (event) => events.push(event),
		onAccessDenied: () => {},
		resolveAudio: async () => ({ audioUrl: "https://media.example/audio.mp3", expiresAt: "2099-01-01T00:00:00Z" }),
	})

	// a buffering pause is not a second start, and an ordinary pause reports playback stopped
	await adapter.load(toLoad())
	emit({ playing: true })
	emit({ playing: false, isBuffering: true })
	emit({ playing: true, isBuffering: false })
	expect(events.filter((event) => event.type === "playback" && event.isPlaying)).toHaveLength(1)
	emit({ playing: false })
	expect(events.at(-1)).toEqual({ type: "playback", loadId: 1, isPlaying: false })

	// a repeated finish reports one end
	emit({ didJustFinish: true })
	emit({ didJustFinish: true })
	expect(events.filter((event) => event.type === "ended")).toHaveLength(1)
	adapter.unload()
})

// the lock screen takes the cover at the api's absolute url, and its failure leaves playback alone
test("the lock screen metadata resolves the cover against the api and a rejected update does not throw", async () => {
	configureApiClient({ apiBaseUrl: "https://api.test", showError: () => {} })
	const { player } = toAudioPlayerFixture()
	const podcastEpisode = toPodcastEpisodeFixture({ smallCoverUrl: "/api/podcast-covers/episode/one-300.jpg" })
	const adapter = toPodcastEpisodeAudioAdapter({
		player,
		onEvent: () => {},
		onAccessDenied: () => {},
		checkAccess: async () => podcastEpisode,
		resolveAudio: async () => ({ audioUrl: "https://media.example/audio.mp3", expiresAt: "2099-01-01T00:00:00Z" }),
	})

	// the metadata update sends the cover's absolute url
	await adapter.load({ ...toLoad(), podcastEpisode })
	const state = {
		podcastEpisode,
		positionSeconds: 45,
		playbackRate: 1.5,
		isPlaying: false,
		isLoading: false,
		errorMessage: null,
	}
	adapter.updateMetadata(state)
	expect(player.setActiveForLockScreen).toHaveBeenCalledWith(
		true,
		expect.objectContaining({ artworkUrl: "https://api.test/api/podcast-covers/episode/one-300.jpg" }),
		expect.anything(),
	)

	// a lock screen the platform rejects is logged, and the update returns
	;(player.setActiveForLockScreen as ReturnType<typeof mock>).mockImplementation(() => {
		throw new Error("Call to function 'AudioPlayer.setActiveForLockScreen' has been rejected.")
	})

	// silence the logged error while the update runs
	const logError = console.error
	console.error = () => {}
	try {
		expect(() => adapter.updateMetadata(state)).not.toThrow()
	} finally {
		console.error = logError
	}
})
