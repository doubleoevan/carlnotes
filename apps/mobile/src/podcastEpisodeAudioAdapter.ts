import {
	fetchPodcastEpisode,
	fetchPodcastEpisodeAudio,
	isPodcastEpisodeAccessDenied,
	PodcastEpisodeRequestError,
} from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type {
	LoadPodcastEpisodeAudioOptions,
	PodcastEpisodeAudioAdapter,
	PodcastEpisodeAudioEvent,
	PodcastEpisodePlayerState,
} from "@carlnotes/core/lib/podcastEpisodeAudio"
import {
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	toPodcastEpisodeMediaMetadata,
} from "@carlnotes/core/lib/podcastEpisodePlayback"
import type { AudioPlayer, AudioStatus } from "expo-audio"

// inject only the platform operations needed by the single root-owned player
export type PodcastEpisodeAudioPlayer = Pick<
	AudioPlayer,
	| "replace"
	| "play"
	| "pause"
	| "seekTo"
	| "setPlaybackRate"
	| "setChapterTargets"
	| "setActiveForLockScreen"
	| "clearLockScreenControls"
	| "addListener"
	| "isLoaded"
>
type ToPodcastEpisodeAudioAdapterOptions = {
	player: PodcastEpisodeAudioPlayer
	onEvent: (event: PodcastEpisodeAudioEvent) => void
	onAccessDenied: () => void
	onCheckpoint?: (state: PodcastEpisodePlayerState) => void
	resolveAudio?: typeof fetchPodcastEpisodeAudio
	checkAccess?: typeof fetchPodcastEpisode
}

/**
 * Adapts one Expo player to shared playback, keeping authorized sources in memory only.
 */
export function toPodcastEpisodeAudioAdapter({
	player,
	onEvent,
	onAccessDenied,
	onCheckpoint,
	resolveAudio = fetchPodcastEpisodeAudio,
	checkAccess = fetchPodcastEpisode,
}: ToPodcastEpisodeAudioAdapterOptions): PodcastEpisodeAudioAdapter {
	// track the selected source and pending playback
	let request: AbortController | undefined
	let currentLoad: LoadPodcastEpisodeAudioOptions | undefined
	let sourceExpiresAt = 0
	let statusSubscription: { remove: () => void } | undefined
	let cancelReadiness: (() => void) | undefined
	let isReady = false
	let hasFinished = false
	let lastIsPlaying = false
	let playVersion = 0

	// revoke pending work before detaching the source and system controls
	const unload = (): void => {
		playVersion += 1
		request?.abort()
		cancelReadiness?.()
		statusSubscription?.remove()
		statusSubscription = undefined
		currentLoad = undefined
		isReady = false
		player.pause()
		player.clearLockScreenControls()
		player.replace(null)
	}

	// retire the old source before loading an episode
	const load = async (options: LoadPodcastEpisodeAudioOptions): Promise<void> => {
		unload()
		const controller = new AbortController()
		request = controller
		currentLoad = options
		try {
			// resolve the authorized audio source
			const source = await resolveAudio(options.podcastEpisode.id, controller.signal)
			controller.signal.throwIfAborted()
			sourceExpiresAt = Date.parse(source.expiresAt)
			player.replace({ uri: source.audioUrl })

			// wait for the platform player to accept the source
			const readiness = toAudioReadiness(player, controller.signal)
			cancelReadiness = readiness.cancel
			await readiness.ready
			controller.signal.throwIfAborted()

			// restore position and configure system chapters
			await player.seekTo(options.positionSeconds, 0, 0)
			controller.signal.throwIfAborted()
			player.setPlaybackRate(options.playbackRate)
			player.setChapterTargets(
				options.podcastEpisode.chapters.map(({ startSeconds, title }) => ({ startSeconds, title })),
			)
			isReady = true
			hasFinished = false
			lastIsPlaying = false

			// forward current playback status
			statusSubscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
				if (controller.signal.aborted || !isReady) {
					return
				}
				options.positionSeconds = status.currentTime
				onEvent({ type: "position", loadId: options.loadId, positionSeconds: status.currentTime })
				onEvent({ type: "buffering", loadId: options.loadId, isBuffering: status.isBuffering })
				if (status.didJustFinish && !hasFinished) {
					hasFinished = true
					onEvent({ type: "ended", loadId: options.loadId })
				} else if (status.error) {
					onEvent({ type: "error", loadId: options.loadId })
				} else if (!status.isBuffering && status.playing !== lastIsPlaying) {
					lastIsPlaying = status.playing
					onEvent({ type: "playback", loadId: options.loadId, isPlaying: status.playing })
				}
			})
		} catch (error) {
			if (!controller.signal.aborted && isPodcastEpisodeAccessDenied(error)) {
				onAccessDenied()
			}
			throw new Error("This episode could not play. Try again.")
		}
	}

	// reject play requests retired by pause or another episode
	const isPlayCurrent = (version: number, selectedLoad: LoadPodcastEpisodeAudioOptions): boolean =>
		version === playVersion && currentLoad === selectedLoad && isReady

	// check current access and refresh an expired source before playing
	const play = async (): Promise<void> => {
		const version = ++playVersion
		const selectedLoad = currentLoad
		if (!selectedLoad) {
			return
		}
		try {
			await validatePodcastEpisodeAccess({
				podcastEpisode: selectedLoad.podcastEpisode,
				checkAccess,
				signal: request?.signal,
			})
			if (!isPlayCurrent(version, selectedLoad)) {
				return
			}
			if (sourceExpiresAt <= Date.now() + 30_000) {
				const refreshedPlayVersion = playVersion + 1
				await load(selectedLoad)
				if (!isPlayCurrent(refreshedPlayVersion, selectedLoad)) {
					return
				}
			}
			hasFinished = false
			player.play()
		} catch (error) {
			if (isPlayCurrent(version, selectedLoad) && isPodcastEpisodeAccessDenied(error)) {
				onAccessDenied()
			}
			throw new Error("This episode could not play. Try again.")
		}
	}
	return {
		load,
		play,
		unload,
		onCheckpoint,
		pause: () => {
			playVersion += 1
			player.pause()
		},
		seek: (seconds) => {
			if (currentLoad) {
				currentLoad.positionSeconds = seconds
			}
			void player.seekTo(seconds, 0, 0).catch(() => {})
		},
		setPlaybackRate: (rate) => {
			if (currentLoad) {
				currentLoad.playbackRate = rate
			}
			player.setPlaybackRate(rate)
		},
		updateMetadata: (state) => {
			if (!state.podcastEpisode || !isReady) {
				return
			}
			if (currentLoad) {
				currentLoad.positionSeconds = state.positionSeconds
			}
			const metadata = toPodcastEpisodeMediaMetadata(state.podcastEpisode, state.positionSeconds)
			player.setActiveForLockScreen(
				true,
				{
					title: metadata.title,
					artist: metadata.artist,
					albumTitle: metadata.album,
					artworkUrl: metadata.artwork[0]?.src,
				},
				{
					showSeekBackward: true,
					showSeekForward: true,
					showPreviousTrack: true,
					showNextTrack: true,
					seekBackwardIntervalSeconds: SKIP_BACK_SECONDS,
					seekForwardIntervalSeconds: SKIP_FORWARD_SECONDS,
				},
			)
		},
	}
}

// recheck current visibility before resuming a previously authorized source
type ValidatePodcastEpisodeAccessOptions = {
	podcastEpisode: PodcastEpisode
	checkAccess: typeof fetchPodcastEpisode
	signal?: AbortSignal
}
async function validatePodcastEpisodeAccess({
	podcastEpisode,
	checkAccess,
	signal,
}: ValidatePodcastEpisodeAccessOptions): Promise<void> {
	const accessiblePodcastEpisode = await checkAccess(podcastEpisode.id, { shouldThrowOnError: true, signal })
	if (!accessiblePodcastEpisode) {
		throw new PodcastEpisodeRequestError(404)
	}
}

// wait for the current source, bounded so an unavailable stream always leaves a retry path
function toAudioReadiness(
	player: PodcastEpisodeAudioPlayer,
	signal: AbortSignal,
): { ready: Promise<void>; cancel: () => void } {
	let cancel = (): void => {}
	const ready = new Promise<void>((resolve, reject) => {
		// settle readiness and release listeners
		const finish = (error?: Error): void => {
			clearTimeout(timer)
			subscription.remove()
			signal.removeEventListener("abort", cancel)
			if (error) {
				reject(error)
			} else {
				resolve()
			}
		}
		const subscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
			if (status.error) {
				finish(new Error("Audio unavailable"))
			} else if (status.isLoaded) {
				finish()
			}
		})
		const timer = setTimeout(() => finish(new Error("Audio timed out")), 20_000)
		cancel = () => finish(new Error("Audio load cancelled"))
		signal.addEventListener("abort", cancel, { once: true })
		if (signal.aborted) {
			cancel()
		} else if (player.isLoaded) {
			finish()
		}
	})
	return { ready, cancel }
}
