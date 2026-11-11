import { toApiUrl } from "@carlnotes/client/apiClient"
import { fetchTopicPodcastEpisodeVideo } from "@carlnotes/client/podcastEpisodeClient"
import type {
	LoadPodcastEpisodeAudioOptions,
	PodcastEpisodeAudioEvent,
	TopicPodcastEpisodeVideoAdapter,
} from "@carlnotes/core/lib/podcastEpisodeAudio"
import { PODCAST_EPISODE_PLAY_FAILED_TEXT } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { toPodcastEpisodeMediaMetadata } from "@carlnotes/core/lib/podcastEpisodePlayback"
import type { VideoPlayer, VideoSource } from "expo-video"

// the platform operations the film adapter drives on one Expo film player
export type TopicPodcastEpisodeVideoPlayerSource = Pick<
	VideoPlayer,
	"replaceAsync" | "play" | "pause" | "currentTime" | "playbackRate" | "addListener"
>

// the platform player, the event sink, and the api call a test replaces
type ToTopicPodcastEpisodeVideoAdapterOptions = {
	player: TopicPodcastEpisodeVideoPlayerSource
	onEvent: (event: PodcastEpisodeAudioEvent) => void
	resolveVideo?: typeof fetchTopicPodcastEpisodeVideo
}

/**
 * Adapts one Expo film player to shared playback, keeping the authorized film url in memory only.
 */
export function toTopicPodcastEpisodeVideoAdapter({
	player,
	onEvent,
	resolveVideo = fetchTopicPodcastEpisodeVideo,
}: ToTopicPodcastEpisodeVideoAdapterOptions): TopicPodcastEpisodeVideoAdapter {
	// the selected load, its source's expiry, and the pending work an unload retires
	let request: AbortController | undefined
	let currentLoad: LoadPodcastEpisodeAudioOptions | undefined
	let sourceExpiresAt = 0
	let subscriptions: { remove: () => void }[] = []
	let cancelReadiness: (() => void) | undefined

	// revoke pending work and the old source's events
	const unload = (): void => {
		request?.abort()
		cancelReadiness?.()
		for (const subscription of subscriptions) {
			subscription.remove()
		}
		subscriptions = []
		currentLoad = undefined

		// stop the film and drop its source
		player.pause()
		void player.replaceAsync(null).catch(() => {})
	}

	// retire the old source before loading a film
	const load = async (options: LoadPodcastEpisodeAudioOptions): Promise<void> => {
		unload()
		const controller = new AbortController()
		request = controller
		currentLoad = options
		try {
			// resolve the authorized film url, and install it with the lock screen's metadata
			const videoFile = await resolveVideo(options.podcastEpisode.id, controller.signal)
			controller.signal.throwIfAborted()
			sourceExpiresAt = Date.parse(videoFile.expiresAt)
			const readiness = toVideoReadiness(player, controller.signal)
			cancelReadiness = readiness.cancel
			await player.replaceAsync(toVideoSource(videoFile.videoUrl, options))
			await readiness.ready
			controller.signal.throwIfAborted()

			// restore the position and the speed, then forward the film's events under this load
			player.currentTime = options.positionSeconds
			player.playbackRate = options.playbackRate
			subscriptions = subscribeToVideoEvents({ player, options, onEvent })
		} catch {
			throw new Error(PODCAST_EPISODE_PLAY_FAILED_TEXT)
		}
	}

	// refresh a source about to expire, then play
	const play = async (): Promise<void> => {
		const selectedLoad = currentLoad
		if (!selectedLoad) {
			return
		}

		// reload an expiring source at the current second, unless another load replaced it meanwhile
		if (sourceExpiresAt <= Date.now() + 30_000) {
			await load({ ...selectedLoad, positionSeconds: player.currentTime })
			if (currentLoad?.loadId !== selectedLoad.loadId) {
				return
			}
		}
		player.play()
	}

	// the source operations, with seek and speed applied to the player at once
	return {
		load,
		play,
		unload,
		pause: () => player.pause(),
		seek: (positionSeconds) => {
			player.currentTime = positionSeconds
		},
		setPlaybackRate: (playbackRate) => {
			if (currentLoad) {
				currentLoad.playbackRate = playbackRate
			}
			player.playbackRate = playbackRate
		},
		// expo-video owns the lock screen while the film plays, from the source's metadata
		updateMetadata: () => {},
	}
}

// the film's url with the lock screen's title, people, and cover. the cover is an api path, which Android takes only
// as an absolute url
function toVideoSource(
	videoUrl: string,
	{ podcastEpisode, positionSeconds }: LoadPodcastEpisodeAudioOptions,
): VideoSource {
	const mediaMetadata = toPodcastEpisodeMediaMetadata(podcastEpisode, positionSeconds)
	const artworkPath = mediaMetadata.artwork?.[0]?.src
	return {
		uri: videoUrl,
		metadata: {
			title: mediaMetadata.title,
			artist: mediaMetadata.artist,
			artwork: artworkPath ? toApiUrl(artworkPath) : undefined,
		},
	}
}

// the player, the load its events belong to, and the event sink
type SubscribeToVideoEventsOptions = {
	player: TopicPodcastEpisodeVideoPlayerSource
	options: LoadPodcastEpisodeAudioOptions
	onEvent: (event: PodcastEpisodeAudioEvent) => void
}

// report the position, playing changes, the end, buffering, and errors under the load's identity
function subscribeToVideoEvents({ player, options, onEvent }: SubscribeToVideoEventsOptions): { remove: () => void }[] {
	const { loadId } = options
	return [
		player.addListener("timeUpdate", ({ currentTime }) => {
			options.positionSeconds = currentTime
			onEvent({ type: "position", loadId, positionSeconds: currentTime })
		}),
		player.addListener("playingChange", ({ isPlaying }) => onEvent({ type: "playback", loadId, isPlaying })),
		player.addListener("playToEnd", () => onEvent({ type: "ended", loadId })),
		player.addListener("statusChange", ({ status }) => {
			if (status === "error") {
				onEvent({ type: "error", loadId })
			} else {
				onEvent({ type: "buffering", loadId, isBuffering: status === "loading" })
			}
		}),
	]
}

// wait for the next source to be ready, bounded so an unavailable film always leaves a retry path
function toVideoReadiness(
	player: TopicPodcastEpisodeVideoPlayerSource,
	signal: AbortSignal,
): { ready: Promise<void>; cancel: () => void } {
	let cancel = (): void => {}
	const ready = new Promise<void>((resolve, reject) => {
		// settle readiness and release listeners
		const finish = (error?: Error): void => {
			clearTimeout(timer)
			subscription.remove()
			signal.removeEventListener("abort", cancel)

			// settle the readiness
			if (error) {
				reject(error)
			} else {
				resolve()
			}
		}
		// the source's ready status settles it, and its error rejects it
		const subscription = player.addListener("statusChange", ({ status }) => {
			if (status === "error") {
				finish(new Error("Film unavailable"))
			} else if (status === "readyToPlay") {
				finish()
			}
		})

		// the time bound, and the cancel that an abort or a retirement runs
		const timer = setTimeout(() => finish(new Error("Film timed out")), 20_000)
		cancel = () => finish(new Error("Film load cancelled"))
		signal.addEventListener("abort", cancel, { once: true })

		// a source already aborted settles at once
		if (signal.aborted) {
			cancel()
		}
	})
	return { ready, cancel }
}
