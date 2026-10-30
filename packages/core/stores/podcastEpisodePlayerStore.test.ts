import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeClient from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { LoadPodcastEpisodeAudioOptions, PodcastEpisodeAudioAdapter } from "../lib/podcastEpisodeAudio"
import { setIsUserSignedIn } from "./podcastEpisodeListenStore"
import { playPodcastEpisodeChapter, togglePodcastEpisodePlayback } from "./podcastEpisodePlayActions"
import {
	clearPodcastEpisodePlayer,
	cyclePlaybackRate,
	pausePodcastEpisode,
	playPodcastEpisode,
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
	seekPlaybackTo,
	skipPodcastEpisodeChapter,
	togglePlayback,
	toPodcastEpisodePlayerState,
} from "./podcastEpisodePlayerStore"

let unregisterAdapter = (): void => {}
afterEach(() => {
	// clear audio before restoring client spies
	unregisterAdapter()
	setIsUserSignedIn(false)
	mock.restore()
})

function toAudioFixture(): {
	adapter: PodcastEpisodeAudioAdapter
	toLoad: () => LoadPodcastEpisodeAudioOptions
	listen: ReturnType<typeof spyOn<typeof podcastEpisodeClient, "sendPodcastEpisodeListen">>
} {
	// report actual playback through the same event boundary as the platform adapters
	let currentLoad: LoadPodcastEpisodeAudioOptions | undefined
	const toLoad = (): LoadPodcastEpisodeAudioOptions => {
		if (!currentLoad) {
			throw new Error("No audio loaded")
		}
		return currentLoad
	}
	const adapter: PodcastEpisodeAudioAdapter = {
		load: mock((options: LoadPodcastEpisodeAudioOptions) => {
			currentLoad = options
		}),
		play: mock(() => reportPodcastEpisodeAudioEvent({ type: "playback", isPlaying: true, loadId: toLoad().loadId })),
		pause: mock(() => {}),
		seek: mock(() => {}),
		setPlaybackRate: mock(() => {}),
		unload: mock(() => {}),
		updateMetadata: mock(() => {}),
		onVisitEvent: mock(() => {}),
	}
	const listen = spyOn(podcastEpisodeClient, "sendPodcastEpisodeListen").mockImplementation(() => {})
	unregisterAdapter = registerPodcastEpisodeAudioAdapter(adapter)
	return { adapter, toLoad, listen }
}

test("loaded chapter selection and paused seeking preserve the shared player", async () => {
	// load saved progress, seek while paused, and keep adjacent chapter boundaries
	const { adapter } = toAudioFixture()
	await playPodcastEpisode(toPodcastEpisodeFixture({ progressSeconds: 45 }))
	pausePodcastEpisode()
	seekPlaybackTo(90)
	expect(toPodcastEpisodePlayerState()).toMatchObject({ positionSeconds: 90, isPlaying: false })
	skipPodcastEpisodeChapter(-1)
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(0)
	skipPodcastEpisodeChapter(-1)
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(0)
	await playPodcastEpisodeChapter("episode-1", 1)
	expect(toPodcastEpisodePlayerState()).toMatchObject({ positionSeconds: 60, isPlaying: true })
	expect(adapter.load).toHaveBeenCalledTimes(1)
})

test("a completed episode starts at zero unless an explicit chapter takes precedence", async () => {
	toAudioFixture()
	await playPodcastEpisode(toPodcastEpisodeFixture({ isCompleted: true, progressSeconds: 600 }))
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(0)
	await playPodcastEpisode(toPodcastEpisodeFixture(), 60)
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(60)
})

test("one real play records one start across toggles and skips", async () => {
	const { listen, adapter, toLoad } = toAudioFixture()
	setIsUserSignedIn(true)
	await playPodcastEpisode(toPodcastEpisodeFixture())
	togglePlayback()
	togglePlayback()
	seekPlaybackTo(70)
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: toLoad().loadId, positionSeconds: 80 })
	expect(listen.mock.calls.filter(([{ podcastEpisodeListen }]) => podcastEpisodeListen.isPlaybackStart)).toHaveLength(1)
	expect(adapter.onVisitEvent).toHaveBeenCalledTimes(1)
})

test("progress saves follow thirty seconds and visitors have no personal listens", async () => {
	const { listen, toLoad } = toAudioFixture()
	let now = 100_000
	spyOn(Date, "now").mockImplementation(() => now)
	await playPodcastEpisode(toPodcastEpisodeFixture())
	expect(listen).not.toHaveBeenCalled()
	setIsUserSignedIn(true)
	await playPodcastEpisode(toPodcastEpisodeFixture({ id: "episode-2" }))
	listen.mockClear()
	for (const elapsedSeconds of [29, 30, 31, 59, 60]) {
		now = 100_000 + elapsedSeconds * 1000
		reportPodcastEpisodeAudioEvent({ type: "position", loadId: toLoad().loadId, positionSeconds: elapsedSeconds })
	}
	expect(listen.mock.calls.map(([{ podcastEpisodeListen }]) => podcastEpisodeListen.progressSeconds)).toEqual([30, 60])
})

test("late next-episode responses cannot replace a later user choice", async () => {
	const { toLoad } = toAudioFixture()
	const nextEpisode = Promise.withResolvers<PodcastEpisode | null>()
	spyOn(podcastEpisodeClient, "fetchNextUnplayedPodcastEpisode").mockReturnValue(nextEpisode.promise)
	setIsUserSignedIn(true)
	await playPodcastEpisode(toPodcastEpisodeFixture())
	reportPodcastEpisodeAudioEvent({ type: "ended", loadId: toLoad().loadId })
	await playPodcastEpisode(toPodcastEpisodeFixture({ id: "chosen-episode" }))
	nextEpisode.resolve(toPodcastEpisodeFixture({ id: "late-episode" }))
	await nextEpisode.promise
	expect(toPodcastEpisodePlayerState().podcastEpisode?.id).toBe("chosen-episode")
})

test("clearing playback retires pending loads, fetches, and audio events", async () => {
	const { toLoad, adapter } = toAudioFixture()
	await playPodcastEpisode(toPodcastEpisodeFixture())
	const oldLoadId = toLoad().loadId
	const fetchedEpisode = Promise.withResolvers<PodcastEpisode | null>()
	spyOn(podcastEpisodeClient, "fetchPodcastEpisode").mockReturnValue(fetchedEpisode.promise)
	const pendingPlay = togglePodcastEpisodePlayback("episode-2")
	clearPodcastEpisodePlayer()
	fetchedEpisode.resolve(toPodcastEpisodeFixture({ id: "episode-2" }))
	await pendingPlay
	reportPodcastEpisodeAudioEvent({ type: "playback", isPlaying: true, loadId: oldLoadId })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ podcastEpisode: null, isPlaying: false })
	expect(adapter.play).toHaveBeenCalledTimes(1)
})

test("a rejected play records no start and speed survives replacement", async () => {
	const { adapter, listen } = toAudioFixture()
	setIsUserSignedIn(true)
	adapter.play = mock(async () => {
		throw new Error("play rejected")
	})
	expect(await playPodcastEpisode(toPodcastEpisodeFixture())).toBe(false)
	expect(listen.mock.calls.some(([{ podcastEpisodeListen }]) => podcastEpisodeListen.isPlaybackStart)).toBe(false)
	cyclePlaybackRate()
	await playPodcastEpisode(toPodcastEpisodeFixture({ id: "episode-2" }))
	expect(toPodcastEpisodePlayerState().playbackRate).toBe(1.25)
	for (let i = 0; i < 4; i += 1) {
		cyclePlaybackRate()
	}
})

test("a delayed audio load cannot start after pause, replacement, or clearing", async () => {
	// leave source resolution pending while a newer action retires its automatic play
	for (const retire of [pausePodcastEpisode, clearPodcastEpisodePlayer]) {
		const { adapter } = toAudioFixture()
		const ready = Promise.withResolvers<void>()
		adapter.load = mock(() => ready.promise)
		const pendingPlay = playPodcastEpisode(toPodcastEpisodeFixture())
		retire()
		ready.resolve()
		expect(await pendingPlay).toBe(false)
		expect(adapter.play).not.toHaveBeenCalled()
	}
})

test("replaying a completed loaded episode clears completion and starts at zero", async () => {
	const { toLoad } = toAudioFixture()
	await playPodcastEpisode(toPodcastEpisodeFixture())
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: toLoad().loadId, positionSeconds: 600 })
	reportPodcastEpisodeAudioEvent({ type: "ended", loadId: toLoad().loadId })
	expect(toPodcastEpisodePlayerState().podcastEpisode?.isCompleted).toBe(true)
	togglePlayback()
	expect(toPodcastEpisodePlayerState()).toMatchObject({
		positionSeconds: 0,
		isPlaying: true,
		podcastEpisode: { isCompleted: false },
	})
})

test("seeking or changing speed checkpoints immediately without adding a listen", async () => {
	const { adapter, listen } = toAudioFixture()
	adapter.onCheckpoint = mock(() => {})
	await playPodcastEpisode(toPodcastEpisodeFixture())
	pausePodcastEpisode()
	const listenCountBeforeSeek = listen.mock.calls.length
	seekPlaybackTo(75)
	cyclePlaybackRate()
	expect(adapter.onCheckpoint).toHaveBeenLastCalledWith(
		expect.objectContaining({ positionSeconds: 75, playbackRate: 1.25 }),
	)
	expect(listen.mock.calls).toHaveLength(listenCountBeforeSeek)
	for (let i = 0; i < 4; i += 1) {
		cyclePlaybackRate()
	}
})
