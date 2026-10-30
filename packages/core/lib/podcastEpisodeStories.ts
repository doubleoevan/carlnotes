import type { PodcastEpisode, PodcastEpisodeTranscriptBlock } from "@carlnotes/contracts/podcast"
import {
	toPodcastEpisodeChapterFixture,
	toPodcastEpisodeFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicFinding, toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { type ReactNode, useEffect } from "react"
import type { ChapterTopicFeed } from "../components/PodcastEpisodeChapters"
import type { PodcastEpisodeChapterTagProps } from "../components/PodcastEpisodeChapterTag"
import type { PodcastFeedState } from "../hooks/usePodcastFeed"
import { setPodcastEpisodeListenAccount } from "../stores/podcastEpisodeListenStore"
import {
	pausePodcastEpisode,
	playPodcastEpisode,
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
} from "../stores/podcastEpisodePlayerStore"
import type { LoadPodcastEpisodeAudioOptions } from "./podcastEpisodeAudio"

// both component browsers use the same six chapters and fictional findings
export const PODCAST_STORY_EPISODE = toPodcastEpisodeFixture({
	title: "Better beans, better mornings",
	isVoiceChatConfigured: false,
	chapterCount: 6,
	durationSeconds: 360,
	chapters: Array.from({ length: 6 }, (_, position) =>
		toPodcastEpisodeChapterFixture({
			position,
			title: `Coffee chapter ${position + 1}`,
			findingId: `coffee-${position}`,
			startSeconds: position * 60,
			endSeconds: (position + 1) * 60,
		}),
	),
})
// a podcast episode title and chapter titles long enough to run past a phone's width
export const PODCAST_STORY_LONG_TITLE_EPISODE: PodcastEpisode = {
	...PODCAST_STORY_EPISODE,
	title: "The surprisingly long story of how a small change to grind size changed every morning cup of coffee",
	chapters: PODCAST_STORY_EPISODE.chapters.map((chapter) => ({
		...chapter,
		title: `${chapter.title}: how a finer grind pulls more flavor from the same beans`,
	})),
}
export const PODCAST_STORY_FEED: ChapterTopicFeed = {
	topic: toTestTopicResponse(),
	topicFindings: PODCAST_STORY_EPISODE.chapters.map((chapter) =>
		toTestTopicFinding({ findingId: chapter.findingId ?? "missing", title: chapter.title }),
	),
	isRatable: true,
	isBookmarkable: true,
	topicFeedHandlers: {
		openTopicFinding: () => {},
		consumeTopicFinding: () => {},
		rateTopicFinding: () => {},
		bookmarkTopicFinding: () => {},
	},
}
export const PODCAST_STORY_TRANSCRIPT: PodcastEpisodeTranscriptBlock[] = Array.from({ length: 4 }, (_, index) => ({
	heading: index ? `Coffee chapter ${index}` : null,
	turns: [
		{
			speakerName: "Carl",
			text: "I read the research before the kettle boiled. A consistent grind and clean water make the comparison useful.",
		},
		{
			speakerName: "Vienna",
			text: "Then let’s compare the findings, one cup at a time. The source matters as much as the tasting note.",
		},
	],
}))
// keep feed previews independent of account tokens and reset requests
export const PODCAST_STORY_FEED_STATE: PodcastFeedState = {
	url: "https://example.test/podcast/fictional-feed.xml",
	isLoading: false,
	isResetting: false,
	isConfirmingReset: false,
	message: null,
	confirmReset: () => {},
	cancelReset: () => {},
	reset: async () => {},
}
export const PODCAST_STORY_CHAPTER_TAG: PodcastEpisodeChapterTagProps = {
	podcastEpisodeChapter: { podcastEpisodeId: PODCAST_STORY_EPISODE.id, chapterPosition: 1 },
	podcastEpisodeNote: {
		podcastEpisodeTitle: PODCAST_STORY_EPISODE.title ?? "Coffee chapter",
		chapterPosition: 1,
		chapterTitle: "Coffee chapter 2",
		speaker: "host",
	},
}
export const PODCAST_STORY_LONG_CHAPTER_NOTE: PodcastEpisodeChapterTagProps["podcastEpisodeNote"] = {
	podcastEpisodeTitle: "The surprisingly long story of how a small change to grind size changed every morning cup",
	chapterPosition: 1,
	chapterTitle: "Comparing six different ways to make a better cup of coffee",
	speaker: "host",
}
export type PodcastPlaybackStoryState = "unloaded" | "playing" | "paused" | "buffering" | "error"

/**
 * Exercises the real shared player with an inert audio adapter, without account writes or media downloads.
 */
export function PodcastEpisodeStory({
	children,
	episode = PODCAST_STORY_EPISODE,
	state = "unloaded",
}: {
	children: ReactNode
	episode?: PodcastEpisode
	state?: PodcastPlaybackStoryState
}): ReactNode {
	useEffect(() => {
		// isolate preview controls from account playback and report the same status events as either audio adapter
		setPodcastEpisodeListenAccount(null)
		let selectedAudioLoad: LoadPodcastEpisodeAudioOptions | undefined
		const unregister = registerPodcastEpisodeAudioAdapter({
			load: (options) => {
				selectedAudioLoad = options
			},
			play: () => {
				if (state === "error") {
					throw new Error("Preview playback failure")
				}
				if (selectedAudioLoad) {
					reportPodcastEpisodeAudioEvent({ loadId: selectedAudioLoad.loadId, type: "playback", isPlaying: true })
				}
			},
			pause: () => {
				if (selectedAudioLoad) {
					reportPodcastEpisodeAudioEvent({ loadId: selectedAudioLoad.loadId, type: "playback", isPlaying: false })
				}
			},
			seek: (positionSeconds) => {
				if (selectedAudioLoad) {
					reportPodcastEpisodeAudioEvent({ loadId: selectedAudioLoad.loadId, type: "position", positionSeconds })
				}
			},
			setPlaybackRate: () => {},
			unload: () => {},
			updateMetadata: () => {},
		})
		// play the podcast episode from 75 seconds for every state except unloaded
		let isActive = true
		if (state !== "unloaded") {
			void playPodcastEpisode(episode, 75).then(() => {
				// skip a story that unmounted, or whose audio never loaded
				if (!isActive || !selectedAudioLoad) {
					return
				}
				// pause a paused story, and mark a buffering story as loading
				if (state === "paused") {
					pausePodcastEpisode()
				}
				if (state === "buffering") {
					reportPodcastEpisodeAudioEvent({ type: "buffering", loadId: selectedAudioLoad.loadId, isBuffering: true })
				}
			})
		}
		// on unmount, ignore the pending play and remove the inert audio adapter
		return () => {
			isActive = false
			unregister()
		}
	}, [episode, state])
	return children
}
