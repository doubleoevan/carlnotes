import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeClient from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTopicPostDiscussionPodcastEpisode } from "@carlnotes/contracts/topicPosts"
import type {
	LoadPodcastEpisodeAudioOptions,
	PodcastEpisodeAudioAdapter,
	TopicPodcastEpisodeVideoAdapter,
} from "../lib/podcastEpisodeAudio"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS, toNextPlaybackRate } from "../lib/podcastEpisodePlayback"
import { TOPIC_POST_DISCUSSION_STORY } from "../lib/topicPostStories"
import { setIsUserSignedIn } from "./podcastEpisodeListenStore"
import { playPodcastEpisodeChapter, togglePodcastEpisodePlayback } from "./podcastEpisodePlayActions"
import {
	clearPodcastEpisodePlayer,
	cyclePlaybackRate,
	cycleTopicPodcastEpisodeVideoPlaybackRate,
	pausePodcastEpisode,
	playPodcastEpisode,
	playPodcastEpisodeAudio,
	playTopicPodcastEpisodeVideo,
	registerPodcastEpisodeAudioAdapter,
	registerTopicPodcastEpisodeVideoAdapter,
	reportPodcastEpisodeAudioEvent,
	seekPlaybackTo,
	skipPodcastEpisodeChapter,
	skipTopicPodcastEpisodeVideoBy,
	togglePlayback,
	toPodcastEpisodePlayerState,
} from "./podcastEpisodePlayerStore"

let unregisterAdapter = (): void => {}
let unregisterVideoAdapter = (): void => {}
afterEach(() => {
	// clear the film surface and the audio before restoring client spies
	unregisterVideoAdapter()
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
	// the adapter records each call, and plays at once
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
	// a skip back stops at the first chapter
	skipPodcastEpisodeChapter(-1)
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(0)
	skipPodcastEpisodeChapter(-1)
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(0)
	// a chapter of the loaded podcast episode plays with no second load
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
	// play, toggle twice, seek, and report progress
	const { listen, adapter, toLoad } = toAudioFixture()
	setIsUserSignedIn(true)
	await playPodcastEpisode(toPodcastEpisodeFixture())
	// pause, resume, seek, and a position, all in one play
	togglePlayback()
	togglePlayback()
	seekPlaybackTo(70)
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: toLoad().loadId, positionSeconds: 80 })

	// one start and one visit event
	expect(listen.mock.calls.filter(([{ podcastEpisodeListen }]) => podcastEpisodeListen.isPlaybackStart)).toHaveLength(1)
	expect(adapter.onVisitEvent).toHaveBeenCalledTimes(1)
})

test("progress saves follow thirty seconds and visitors have no personal listens", async () => {
	// the audio, and a clock the test moves
	const { listen, toLoad } = toAudioFixture()
	let now = 100_000
	spyOn(Date, "now").mockImplementation(() => now)

	// a visitor's play sends no listen
	await playPodcastEpisode(toPodcastEpisodeFixture())
	expect(listen).not.toHaveBeenCalled()
	// a signed-in user's progress is saved
	setIsUserSignedIn(true)
	await playPodcastEpisode(toPodcastEpisodeFixture({ id: "episode-2" }))
	listen.mockClear()
	// report a position at each count of seconds
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
	// the episode ends, and the user picks another before the next one loads
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
	// a fetch still pending as the player clears
	const fetchedEpisode = Promise.withResolvers<PodcastEpisode | null>()
	spyOn(podcastEpisodeClient, "fetchPodcastEpisode").mockReturnValue(fetchedEpisode.promise)

	// clear while a play waits on its fetch
	const pendingPlay = togglePodcastEpisodePlayback("episode-2")
	clearPodcastEpisodePlayer()
	fetchedEpisode.resolve(toPodcastEpisodeFixture({ id: "episode-2" }))
	await pendingPlay
	// a late event of the cleared load changes nothing
	reportPodcastEpisodeAudioEvent({ type: "playback", isPlaying: true, loadId: oldLoadId })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ podcastEpisode: null, isPlaying: false })
	expect(adapter.play).toHaveBeenCalledTimes(1)
})

test("a rejected play records no start and speed survives replacement", async () => {
	const { adapter, listen } = toAudioFixture()
	setIsUserSignedIn(true)
	// a play the platform rejects
	adapter.play = mock(async () => {
		throw new Error("play rejected")
	})
	expect(await playPodcastEpisode(toPodcastEpisodeFixture())).toBe(false)
	expect(listen.mock.calls.some(([{ podcastEpisodeListen }]) => podcastEpisodeListen.isPlaybackStart)).toBe(false)
	// the speed carries to the next podcast episode
	cyclePlaybackRate()
	await playPodcastEpisode(toPodcastEpisodeFixture({ id: "episode-2" }))
	expect(toPodcastEpisodePlayerState().playbackRate).toBe(1.25)

	// cycle the speed back to 1
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
		// retire the play while its load is pending
		const pendingPlay = playPodcastEpisode(toPodcastEpisodeFixture())
		retire()
		ready.resolve()

		// the retired load never plays
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
	// a seek and a speed change, each a checkpoint and neither a listen
	const listenCountBeforeSeek = listen.mock.calls.length
	seekPlaybackTo(75)
	cyclePlaybackRate()
	expect(adapter.onCheckpoint).toHaveBeenLastCalledWith(
		expect.objectContaining({ positionSeconds: 75, playbackRate: 1.25 }),
	)
	expect(listen.mock.calls).toHaveLength(listenCountBeforeSeek)

	// cycle the speed back to 1
	for (let i = 0; i < 4; i += 1) {
		cyclePlaybackRate()
	}
})

test("a Topic Post's discussion saves no progress, and ends with no next episode", async () => {
	// the discussion in the player's shape, played by a signed-in user
	const { toLoad, listen } = toAudioFixture()
	const nextPodcastEpisodeSpy = spyOn(podcastEpisodeClient, "fetchNextUnplayedPodcastEpisode").mockResolvedValue(null)
	setIsUserSignedIn(true)
	const discussion = toTopicPostDiscussionPodcastEpisode(TOPIC_POST_DISCUSSION_STORY)
	if (!discussion) {
		throw new Error("the story's post has a recording")
	}
	await playPodcastEpisode(discussion)

	// neither its playback, its position, nor its end reaches the episode routes
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: toLoad().loadId, positionSeconds: 31 })
	reportPodcastEpisodeAudioEvent({ type: "ended", loadId: toLoad().loadId })
	await Promise.resolve()
	expect(listen).not.toHaveBeenCalled()
	expect(nextPodcastEpisodeSpy).not.toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState().podcastEpisode?.isCompleted).toBe(true)
})

// a podcast episode with a film
const FILM_PODCAST_EPISODE = toPodcastEpisodeFixture({
	video: { videoUrl: "https://example.test/episode-1/video.mp4", captionsUrl: "https://example.test/captions.vtt" },
})

function toVideoFixture(): { adapter: TopicPodcastEpisodeVideoAdapter; toLoad: () => LoadPodcastEpisodeAudioOptions } {
	// report the film's playback through the same event boundary as the audio
	let currentLoad: LoadPodcastEpisodeAudioOptions | undefined
	const toLoad = (): LoadPodcastEpisodeAudioOptions => {
		if (!currentLoad) {
			throw new Error("No film loaded")
		}
		return currentLoad
	}
	// a film player that records its load
	const adapter: TopicPodcastEpisodeVideoAdapter = {
		load: mock((options: LoadPodcastEpisodeAudioOptions) => {
			currentLoad = options
		}),
		play: mock(() => reportPodcastEpisodeAudioEvent({ type: "playback", isPlaying: true, loadId: toLoad().loadId })),
		pause: mock(() => {}),
		seek: mock(() => {}),
		setPlaybackRate: mock(() => {}),
		unload: mock(() => {}),
		updateMetadata: mock(() => {}),
	}
	unregisterVideoAdapter = registerTopicPodcastEpisodeVideoAdapter(adapter)
	return { adapter, toLoad }
}

test("a film that ends plays no next podcast episode", async () => {
	// a signed-in user's film, played to its end
	toAudioFixture()
	const film = toVideoFixture()
	const nextPodcastEpisodeSpy = spyOn(podcastEpisodeClient, "fetchNextUnplayedPodcastEpisode").mockResolvedValue(
		toPodcastEpisodeFixture({ id: "next-episode" }),
	)
	setIsUserSignedIn(true)
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)
	reportPodcastEpisodeAudioEvent({ type: "ended", loadId: film.toLoad().loadId })
	await Promise.resolve()

	// the film is completed and stopped, and nothing else was asked for
	expect(nextPodcastEpisodeSpy).not.toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState()).toMatchObject({ isPlaying: false })
	expect(toPodcastEpisodePlayerState().podcastEpisode?.id).toBe(FILM_PODCAST_EPISODE.id)
})

test("playing the film stops the audio and continues from the same second, and playing the audio does the reverse", async () => {
	// listen to the audio until 1:40
	const audio = toAudioFixture()
	const film = toVideoFixture()
	await playPodcastEpisode(FILM_PODCAST_EPISODE)
	const audioLoadId = audio.toLoad().loadId
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: audioLoadId, positionSeconds: 100 })

	// play the film. it starts at the same second, with the audio stopped
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)
	expect(film.toLoad()).toMatchObject({ positionSeconds: 100 })
	expect(film.adapter.play).toHaveBeenCalledTimes(1)
	expect(audio.adapter.pause).toHaveBeenCalled()
	expect(audio.adapter.unload).toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", positionSeconds: 100, isPlaying: true })

	// a late event from the audio no longer moves the player
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: audioLoadId, positionSeconds: 5 })
	expect(toPodcastEpisodePlayerState().positionSeconds).toBe(100)

	// watch until 2:30, then play the audio. it starts at the same second, with the film stopped
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: film.toLoad().loadId, positionSeconds: 150 })
	await playPodcastEpisodeAudio(FILM_PODCAST_EPISODE)
	expect(audio.toLoad()).toMatchObject({ positionSeconds: 150 })
	expect(film.adapter.pause).toHaveBeenCalled()
	expect(film.adapter.unload).toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "audio", positionSeconds: 150, isPlaying: true })
})

test("another podcast episode's play stops the loaded film and plays as audio", async () => {
	// watch a film
	const audio = toAudioFixture()
	const film = toVideoFixture()
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)

	// a play button of another podcast episode with a film plays its audio
	const otherPodcastEpisode = { ...FILM_PODCAST_EPISODE, id: "episode-other" }
	await playPodcastEpisode(otherPodcastEpisode)
	expect(film.adapter.unload).toHaveBeenCalled()
	expect(audio.toLoad().podcastEpisode.id).toBe("episode-other")
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "audio", isPlaying: true })
})

test("a film player that goes away pauses the film there, and the docked play continues as audio", async () => {
	// watch the film until 1:10
	const audio = toAudioFixture()
	const film = toVideoFixture()
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: film.toLoad().loadId, positionSeconds: 70 })

	// remove the film player. the film stops where it stood
	unregisterVideoAdapter()
	expect(film.adapter.pause).toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "audio", positionSeconds: 70, isPlaying: false })

	// the docked play loads the audio at the same second and plays it
	togglePlayback()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(audio.toLoad()).toMatchObject({ positionSeconds: 70 })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "audio", isPlaying: true })
})

test("a film play saves one playback start with its format, and the other format saves no other", async () => {
	// a signed-in user starts the film
	const { listen } = toAudioFixture()
	toVideoFixture()
	setIsUserSignedIn(true)
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)

	// play the audio and the film again
	await playPodcastEpisodeAudio(FILM_PODCAST_EPISODE)
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)

	// one start, saved with the film's format
	const playbackStarts = listen.mock.calls.filter(([{ podcastEpisodeListen }]) => podcastEpisodeListen.isPlaybackStart)
	expect(playbackStarts.map(([{ podcastEpisodeListen }]) => podcastEpisodeListen.format)).toEqual(["video"])
})

test("a podcast episode without a film never plays as one", async () => {
	// no film on the podcast episode, and no film without a film player
	toAudioFixture()
	toVideoFixture()
	expect(await playTopicPodcastEpisodeVideo(toPodcastEpisodeFixture())).toBe(false)
	unregisterVideoAdapter()
	await playPodcastEpisode(FILM_PODCAST_EPISODE)
	expect(await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)).toBe(false)
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "audio", isPlaying: true })
})

test("a chapter pill seeks the loaded film instead of loading the audio", async () => {
	// watch the film
	const audio = toAudioFixture()
	const film = toVideoFixture()
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)

	// a pill press seeks the film to the chapter's start, and the audio stays unloaded
	await playPodcastEpisode(FILM_PODCAST_EPISODE, 120)
	expect(film.adapter.seek).toHaveBeenCalledWith(120)
	expect(audio.adapter.load).not.toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState().format).toBe("video")
})

test("the film's play continues the loaded audio at the same speed", async () => {
	// listen until 1:40 at the next speed, then play the film
	const audio = toAudioFixture()
	const film = toVideoFixture()
	await playPodcastEpisode(FILM_PODCAST_EPISODE)
	cyclePlaybackRate()
	const { playbackRate } = toPodcastEpisodePlayerState()
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: audio.toLoad().loadId, positionSeconds: 100 })
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)

	// the film holds the audio's second and speed
	expect(film.toLoad()).toMatchObject({ positionSeconds: 100, playbackRate })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", positionSeconds: 100, isPlaying: true })
})

test("a format switch reports only the podcast episode and the format", async () => {
	// listen, then play the film, then play the audio again
	const audio = toAudioFixture()
	toVideoFixture()
	const onFormatSwitched = mock((_podcastEpisode: PodcastEpisode, _format: string) => {})
	audio.adapter.onFormatSwitched = onFormatSwitched
	await playPodcastEpisode(FILM_PODCAST_EPISODE)
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)
	await playPodcastEpisodeAudio(FILM_PODCAST_EPISODE)

	// another podcast episode's play is no switch of the loaded one
	await playTopicPodcastEpisodeVideo(FILM_PODCAST_EPISODE)
	await playPodcastEpisode({ ...FILM_PODCAST_EPISODE, id: "episode-other" })

	// one report per switch, naming the podcast episode and its new format
	const switchReports = onFormatSwitched.mock.calls.map(([podcastEpisode, format]) => [podcastEpisode.id, format])
	expect(switchReports).toEqual([
		[FILM_PODCAST_EPISODE.id, "video"],
		[FILM_PODCAST_EPISODE.id, "audio"],
		[FILM_PODCAST_EPISODE.id, "video"],
	])
})

test("a skip forward before the film is loaded starts the film a skip past its start position", async () => {
	// a film with saved progress at 1:00, on its poster
	toAudioFixture()
	const film = toVideoFixture()
	const savedPodcastEpisode = { ...FILM_PODCAST_EPISODE, progressSeconds: 60 }

	// the press starts the film 30 seconds past the saved progress
	skipTopicPodcastEpisodeVideoBy(savedPodcastEpisode, SKIP_FORWARD_SECONDS)
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(film.toLoad()).toMatchObject({ positionSeconds: 60 + SKIP_FORWARD_SECONDS })
	expect(film.adapter.play).toHaveBeenCalledTimes(1)
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", isPlaying: true })

	// a press on the loaded film seeks it, and loads nothing again
	skipTopicPodcastEpisodeVideoBy(savedPodcastEpisode, SKIP_FORWARD_SECONDS)
	expect(film.adapter.seek).toHaveBeenCalledWith(60 + 2 * SKIP_FORWARD_SECONDS)
	expect(film.adapter.load).toHaveBeenCalledTimes(1)
})

test("a skip back before the film is loaded starts the film at zero, or a skip behind the audio's second", async () => {
	// a film with no progress starts at zero
	const audio = toAudioFixture()
	const film = toVideoFixture()
	skipTopicPodcastEpisodeVideoBy(FILM_PODCAST_EPISODE, -SKIP_BACK_SECONDS)
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(film.toLoad()).toMatchObject({ positionSeconds: 0 })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", isPlaying: true })

	// listen to the audio until 1:40. the press takes the film over 15 seconds behind it, with the audio stopped
	await playPodcastEpisodeAudio(FILM_PODCAST_EPISODE)
	reportPodcastEpisodeAudioEvent({ type: "position", loadId: audio.toLoad().loadId, positionSeconds: 100 })
	skipTopicPodcastEpisodeVideoBy(FILM_PODCAST_EPISODE, -SKIP_BACK_SECONDS)
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(film.toLoad()).toMatchObject({ positionSeconds: 100 - SKIP_BACK_SECONDS })
	expect(audio.adapter.unload).toHaveBeenCalled()
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", isPlaying: true })
})

test("a speed press before the film is loaded starts the film at the next speed", async () => {
	// a film on its poster, at the speed the player holds
	toAudioFixture()
	const film = toVideoFixture()
	const nextPlaybackRate = toNextPlaybackRate(toPodcastEpisodePlayerState().playbackRate)

	// the press steps the speed and starts the film at it
	cycleTopicPodcastEpisodeVideoPlaybackRate(FILM_PODCAST_EPISODE)
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(film.toLoad()).toMatchObject({ positionSeconds: 0, playbackRate: nextPlaybackRate })
	expect(toPodcastEpisodePlayerState()).toMatchObject({ format: "video", isPlaying: true })

	// a press on the loaded film steps the speed alone
	cycleTopicPodcastEpisodeVideoPlaybackRate(FILM_PODCAST_EPISODE)
	expect(film.adapter.setPlaybackRate).toHaveBeenCalledWith(toNextPlaybackRate(nextPlaybackRate))
	expect(film.adapter.load).toHaveBeenCalledTimes(1)
})
