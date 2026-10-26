import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"

// the entry points shared by browser and native playback
export type TopicTutorialVideoOpener =
	| "hero"
	| "header"
	| "account-menu"
	| "mobile-menu"
	| "mobile-header"
	| "mobile-settings"
export const TOPIC_TUTORIAL_WATCH_LABEL = `Watch ${TOPIC_TUTORIAL_VIDEO.name}`

/**
 * Names the tutorial and the entry point for an actual playback event.
 */
export function toTopicTutorialPlayProperties(opener: TopicTutorialVideoOpener): {
	youtubeVideoId: string
	opener: TopicTutorialVideoOpener
} {
	return { youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId, opener }
}

/**
 * Records only the first playing event during one opening of the tutorial.
 */
export function toTutorialPlayRecorder(onPlay: () => void): (playerState: string) => void {
	let hasPlayed = false
	return (playerState) => {
		if (playerState !== "playing" || hasPlayed) {
			return
		}
		hasPlayed = true
		onPlay()
	}
}
