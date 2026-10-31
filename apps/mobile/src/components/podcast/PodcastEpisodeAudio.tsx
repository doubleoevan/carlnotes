import { fetchPodcastEpisode, isPodcastEpisodeAccessDenied } from "@carlnotes/client/podcastEpisodeClient"
import { setPodcastEpisodeListenAccount } from "@carlnotes/core/stores/podcastEpisodeListenStore"
import {
	clearPodcastEpisodePlayer,
	isPodcastEpisodeRequestCurrent,
	pausePodcastEpisode,
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
	restorePodcastEpisode,
	retirePodcastEpisodeRequests,
	savePodcastEpisodeProgress,
	toPodcastEpisodePlayerState,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { PODCAST_EPISODE_QUESTION_AUDIO_CALLBACKS } from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createAudioPlayer } from "expo-audio"
import { usePathname } from "expo-router"
import { useEffect } from "react"
import { AppState } from "react-native"
import { toPodcastEpisodeAudioAdapter } from "@/podcastEpisodeAudioAdapter"
import { createPodcastEpisodeCheckpointStore } from "@/podcastEpisodeCheckpoint"
import { registerPodcastEpisodeCheckpoint } from "@/podcastEpisodeSession"
import { captureEpisodeVisitEvent } from "@/visitAnalytics"
import { setIsRecordingAudioMode } from "@/voiceAudioMode"

/**
 * Owns audio across navigation, with account-scoped restoration and foreground access checks.
 */
export function PodcastEpisodeAudio({ userId }: { userId: string | null }) {
	const isStorybook = usePathname() === "/storybook"
	useEffect(() => {
		if (isStorybook) {
			return
		}
		// own one source for this account's app lifetime
		let isActive = true
		const player = createAudioPlayer(null, { updateInterval: 500, downloadFirst: false })
		const checkpoint = userId ? createPodcastEpisodeCheckpointStore({ storage: AsyncStorage, userId }) : null
		const unregisterCheckpoint = registerPodcastEpisodeCheckpoint(checkpoint)
		setPodcastEpisodeListenAccount(userId)
		const clearDenied = (): void => {
			clearPodcastEpisodePlayer()
			void checkpoint?.forget()
		}
		const adapter = toPodcastEpisodeAudioAdapter({
			player,
			onEvent: reportPodcastEpisodeAudioEvent,
			onAccessDenied: clearDenied,
			onCheckpoint: checkpoint?.save,
		})
		const unregister = registerPodcastEpisodeAudioAdapter({
			...adapter,
			...PODCAST_EPISODE_QUESTION_AUDIO_CALLBACKS,
			onVisitEvent: captureEpisodeVisitEvent,
		})
		const version = retirePodcastEpisodeRequests()
		const isCurrent = (): boolean => isActive && isPodcastEpisodeRequestCurrent(version)

		// configure background playback and restore a paused checkpoint
		const restore = async (): Promise<void> => {
			await setIsRecordingAudioMode(false)

			// validate access before restoring saved playback
			const savedCheckpoint = await checkpoint?.read()
			if (!savedCheckpoint || !isCurrent()) {
				return
			}
			const episodeAccess = await readPodcastEpisodeAccess(savedCheckpoint.podcastEpisodeId)
			if (!isCurrent()) {
				return
			}
			if (episodeAccess.status === "denied") {
				clearDenied()
			}
			if (episodeAccess.status === "allowed" && episodeAccess.episode) {
				restorePodcastEpisode({
					podcastEpisode: { ...episodeAccess.episode, isCompleted: savedCheckpoint.isCompleted },
					positionSeconds: savedCheckpoint.positionSeconds,
					playbackRate: savedCheckpoint.playbackRate,
				})
			}
		}
		void restore().catch(() => {})

		// recheck loaded episodes after visibility changes and whenever the app returns
		let isCheckingAccess = false
		const isSelected = (id: string): boolean => isActive && toPodcastEpisodePlayerState().podcastEpisode?.id === id
		const checkAccess = async (): Promise<void> => {
			const episode = toPodcastEpisodePlayerState().podcastEpisode
			if (!episode || isCheckingAccess) {
				return
			}
			// serialize access checks for the selected episode
			isCheckingAccess = true
			const episodeAccess = await readPodcastEpisodeAccess(episode.id)
			isCheckingAccess = false
			if (!isSelected(episode.id)) {
				return
			}
			if (episodeAccess.status === "denied") {
				clearDenied()
			}
			if (episodeAccess.status === "unavailable") {
				pausePodcastEpisode()
			}
		}
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") {
				void checkAccess()
			} else {
				savePodcastEpisodeProgress()
			}
		})
		const timer = setInterval(() => {
			if (AppState.currentState === "active") {
				void checkAccess()
			}
		}, 60_000)
		return () => {
			// save progress and retire this account’s audio resources
			isActive = false
			savePodcastEpisodeProgress()
			checkpoint?.retire()
			setPodcastEpisodeListenAccount(null)
			clearInterval(timer)
			subscription.remove()
			unregisterCheckpoint()
			unregister()
			player.remove()
		}
	}, [userId, isStorybook])
	return null
}

// separate a confirmed denial from a connection failure without retaining a response body
async function readPodcastEpisodeAccess(
	podcastEpisodeId: string,
): Promise<
	{ status: "allowed"; episode: Awaited<ReturnType<typeof fetchPodcastEpisode>> } | { status: "denied" | "unavailable" }
> {
	try {
		const episode = await fetchPodcastEpisode(podcastEpisodeId, { shouldThrowOnError: true })
		return episode ? { status: "allowed", episode } : { status: "denied" }
	} catch (error) {
		return { status: isPodcastEpisodeAccessDenied(error) ? "denied" : "unavailable" }
	}
}
