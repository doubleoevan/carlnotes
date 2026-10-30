// playing a podcast episode from one of its chapters: the loaded podcast episode plays from the chapter's start, any
// other is fetched first, and a missing chapter plays from where the user left off
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeClient from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	toPodcastEpisodeChapterFixture,
	toPodcastEpisodeFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { playPodcastEpisodeChapter } from "./podcastEpisodePlayActions"
import * as podcastEpisodePlayerStore from "./podcastEpisodePlayerStore"

// put the player store's and the client's spies back after each test
afterEach(() => {
	mock.restore()
})

// a podcast episode with chapters that start at 0 and 155 seconds
function toPodcastEpisode(podcastEpisodeId: string): PodcastEpisode {
	const chapters = [0, 155].map((startSeconds, position) => toPodcastEpisodeChapterFixture({ position, startSeconds }))
	return toPodcastEpisodeFixture({ id: podcastEpisodeId, chapters })
}

// the spies on the play and on the fetch
type PlayerSpies = {
	playPodcastEpisodeSpy: Mock<typeof podcastEpisodePlayerStore.playPodcastEpisode>
	fetchPodcastEpisodeSpy: Mock<typeof podcastEpisodeClient.fetchPodcastEpisode>
}

// the loaded podcast episode, the play that does nothing here, and the fetch of any other podcast episode
function spyOnPlayer({ loadedPodcastEpisode }: { loadedPodcastEpisode: PodcastEpisode | null }): PlayerSpies {
	spyOn(podcastEpisodePlayerStore, "toLoadedPodcastEpisode").mockReturnValue(loadedPodcastEpisode)
	const playPodcastEpisodeSpy = spyOn(podcastEpisodePlayerStore, "playPodcastEpisode").mockResolvedValue(true)
	const fetchPodcastEpisodeSpy = spyOn(podcastEpisodeClient, "fetchPodcastEpisode").mockImplementation(
		async (podcastEpisodeId) => toPodcastEpisode(podcastEpisodeId),
	)
	return { playPodcastEpisodeSpy, fetchPodcastEpisodeSpy }
}

test("playPodcastEpisodeChapter plays the loaded podcast episode from the chapter's start without a fetch", async () => {
	// the podcast episode is loaded, and its second chapter is asked for
	const loadedPodcastEpisode = toPodcastEpisode("episode-1")
	const { playPodcastEpisodeSpy, fetchPodcastEpisodeSpy } = spyOnPlayer({ loadedPodcastEpisode })
	await playPodcastEpisodeChapter("episode-1", 1)
	expect(fetchPodcastEpisodeSpy).not.toHaveBeenCalled()
	expect(playPodcastEpisodeSpy).toHaveBeenCalledWith(loadedPodcastEpisode, 155)
})

test("playPodcastEpisodeChapter fetches another podcast episode and plays it from the chapter's start", async () => {
	// another podcast episode is loaded, so the asked one is fetched
	const { playPodcastEpisodeSpy, fetchPodcastEpisodeSpy } = spyOnPlayer({
		loadedPodcastEpisode: toPodcastEpisode("episode-1"),
	})
	await playPodcastEpisodeChapter("episode-2", 1)
	expect(fetchPodcastEpisodeSpy).toHaveBeenCalledWith("episode-2")
	expect(playPodcastEpisodeSpy).toHaveBeenCalledWith(toPodcastEpisode("episode-2"), 155)
})

test("playPodcastEpisodeChapter plays from where the user left off if the chapter is gone", async () => {
	// a chapter position past the last chapter plays with no start
	const { playPodcastEpisodeSpy } = spyOnPlayer({ loadedPodcastEpisode: null })
	await playPodcastEpisodeChapter("episode-2", 5)
	expect(playPodcastEpisodeSpy).toHaveBeenCalledWith(toPodcastEpisode("episode-2"), undefined)
})

test("playPodcastEpisodeChapter plays nothing if the podcast episode fails to fetch", async () => {
	// no podcast episode is loaded, and the fetch returns none
	const { playPodcastEpisodeSpy, fetchPodcastEpisodeSpy } = spyOnPlayer({ loadedPodcastEpisode: null })
	fetchPodcastEpisodeSpy.mockResolvedValue(null)
	await playPodcastEpisodeChapter("episode-2", 1)
	expect(playPodcastEpisodeSpy).not.toHaveBeenCalled()
})
