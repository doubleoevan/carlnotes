// the fixtures the podcast episode question tests share: the player store's spies and a stubbed recording
import { type Mock, mock, spyOn } from "bun:test"
import type { PodcastEpisode } from "@shared/contracts/podcast"
import * as podcastEpisodePlayerStore from "@/stores/podcastEpisodePlayerStore"

// the spy on the resume, and the call that sets whether a later tap finds the podcast episode playing
export type PodcastEpisodePlayerSpies = {
	resumeSpy: Mock<typeof podcastEpisodePlayerStore.resumePodcastEpisode>
	setIsPlaying: (isPlaying: boolean) => void
}

/**
 * Stubs the player store with the podcast episode on its first chapter, playing or paused, and a pause and a resume
 * that do nothing. Returns the resume's spy, and the call that sets whether a later tap finds the podcast episode
 * playing.
 */
export function spyOnPodcastEpisodePlayer({
	podcastEpisode,
	isPlaying,
}: {
	podcastEpisode: PodcastEpisode
	isPlaying: boolean
}): PodcastEpisodePlayerSpies {
	// the podcast episode a tap finds, playing or paused
	const toPodcastEpisodeQuestionStartSpy = spyOn(podcastEpisodePlayerStore, "toPodcastEpisodeQuestionStart")
	const setIsPlaying = (isPlayingAtTap: boolean): void => {
		toPodcastEpisodeQuestionStartSpy.mockReturnValue({ podcastEpisode, chapterPosition: 0, isPlaying: isPlayingAtTap })
	}
	setIsPlaying(isPlaying)

	// the pause and the resume
	spyOn(podcastEpisodePlayerStore, "pausePodcastEpisode").mockImplementation(() => {})
	const resumeSpy = spyOn(podcastEpisodePlayerStore, "resumePodcastEpisode").mockImplementation(() => {})
	return { resumeSpy, setIsPlaying }
}

/**
 * Returns a recording's send and cancel, which do nothing.
 */
export function toVoiceRecordingMock(): { send: Mock<() => void>; cancel: Mock<() => void> } {
	return { send: mock(() => {}), cancel: mock(() => {}) }
}
