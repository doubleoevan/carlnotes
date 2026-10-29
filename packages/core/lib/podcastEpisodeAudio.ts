import type { PodcastEpisode } from "@carlnotes/contracts/podcast"

// the shared playback state. only the audio adapter holds a playable source
export type PodcastEpisodePlayerState = {
	podcastEpisode: PodcastEpisode | null
	isPlaying: boolean
	isLoading: boolean
	positionSeconds: number
	playbackRate: number
	errorMessage: string | null
}

// a load identity rejects events from an earlier episode or account
export type LoadPodcastEpisodeAudioOptions = {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	playbackRate: number
	loadId: number
}

// the operations each app supplies for its single audio player
export type PodcastEpisodeAudioAdapter = {
	load: (options: LoadPodcastEpisodeAudioOptions) => void | Promise<void>
	play: () => void | Promise<void>
	pause: () => void
	seek: (positionSeconds: number) => void
	setPlaybackRate: (playbackRate: number) => void
	unload: () => void
	updateMetadata: (state: PodcastEpisodePlayerState) => void
	onPlaybackStarted?: () => void
	onSeek?: () => void
	onCheckpoint?: (state: PodcastEpisodePlayerState) => void
	onVisitEvent?: (event: "visit_episode_played" | "visit_episode_completed", podcastEpisode: PodcastEpisode) => void
}

// status events belong to the load that produced them
export type PodcastEpisodeAudioEvent = { loadId: number } & (
	| { type: "position"; positionSeconds: number }
	| { type: "playback"; isPlaying: boolean }
	| { type: "ended" }
	| { type: "buffering"; isBuffering: boolean }
	| { type: "error" }
)
