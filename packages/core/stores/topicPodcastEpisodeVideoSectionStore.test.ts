// Topic Cinema's page state: the section opens on each page load, a toggle changes only the page, a Coffee Break films
// row opens the section on its film and asks for a scroll, and a page that closes drops its changes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import * as playerStore from "./podcastEpisodePlayerStore"
import {
	clearTopicPodcastEpisodeVideoSectionChange,
	playInTopicPodcastEpisodeVideoSection,
	setTopicPodcastEpisodeVideoSectionOpen,
	toTopicPodcastEpisodeVideoSection,
} from "./topicPodcastEpisodeVideoSectionStore"

// the latest film, an older film, and the topic read's section
const latestFilm = toPodcastEpisodeFixture({ id: "episode-latest" })
const olderFilm = toPodcastEpisodeFixture({ id: "episode-older" })
const latestFilmSection = { podcastEpisode: latestFilm }

// put every spy back after each test
afterEach(() => {
	mock.restore()
})

test("the section opens on the page, and a toggle closes it on that topic alone", () => {
	// the section opens
	expect(toTopicPodcastEpisodeVideoSection("topic-a", latestFilmSection).isOpen).toBe(true)

	// a toggle closes the section on its topic alone, and another topic's section stays open
	setTopicPodcastEpisodeVideoSectionOpen({ topicId: "topic-a", isOpen: false })
	expect(toTopicPodcastEpisodeVideoSection("topic-a", latestFilmSection).isOpen).toBe(false)
	expect(toTopicPodcastEpisodeVideoSection("topic-z", latestFilmSection).isOpen).toBe(true)
})

test("a row opens the section on its film, asks for a scroll, and plays the film", () => {
	// a section closed on the page, and a row press on an older film
	const play = spyOn(playerStore, "playTopicPodcastEpisodeVideo").mockResolvedValue(true)
	setTopicPodcastEpisodeVideoSectionOpen({ topicId: "topic-b", isOpen: false })
	playInTopicPodcastEpisodeVideoSection("topic-b", olderFilm)

	// the section opens on the older film, asks for one scroll, and plays it
	const section = toTopicPodcastEpisodeVideoSection("topic-b", latestFilmSection)
	expect(section).toMatchObject({ podcastEpisode: { id: "episode-older" }, isOpen: true, scrollRequestCount: 1 })
	expect(play).toHaveBeenCalledWith(olderFilm)

	// another topic reads its own section
	expect(toTopicPodcastEpisodeVideoSection("topic-c", latestFilmSection)).toMatchObject({
		podcastEpisode: { id: "episode-latest" },
		isOpen: true,
		scrollRequestCount: 0,
	})
})

test("a page that closes drops its changes, so the next visit shows the latest film, open", () => {
	// a closed section on an older film, then another topic's page closing, which leaves it alone
	spyOn(playerStore, "playTopicPodcastEpisodeVideo").mockResolvedValue(true)
	playInTopicPodcastEpisodeVideoSection("topic-d", olderFilm)
	setTopicPodcastEpisodeVideoSectionOpen({ topicId: "topic-d", isOpen: false })
	clearTopicPodcastEpisodeVideoSectionChange("topic-other")
	expect(toTopicPodcastEpisodeVideoSection("topic-d", latestFilmSection).isOpen).toBe(false)

	// the topic's own page closing opens the section on the latest film again
	clearTopicPodcastEpisodeVideoSectionChange("topic-d")
	const section = toTopicPodcastEpisodeVideoSection("topic-d", latestFilmSection)
	expect(section).toMatchObject({ podcastEpisode: { id: "episode-latest" }, isOpen: true, scrollRequestCount: 0 })
})
