// Topic Cinema's page state: the read decides until the user acts, a signed-in toggle saves with the latest film, a
// visitor's toggle saves nothing, and a Coffee Break films row opens the section on its film and asks for a scroll
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeClient from "@carlnotes/client/podcastEpisodeClient"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { setIsUserSignedIn } from "./podcastEpisodeListenStore"
import * as playerStore from "./podcastEpisodePlayerStore"
import {
	playInTopicPodcastEpisodeVideoSection,
	setTopicPodcastEpisodeVideoSectionOpen,
	toTopicPodcastEpisodeVideoSection,
} from "./topicPodcastEpisodeVideoSectionStore"

// the latest film, an older film, and the topic read's closed section
const latestFilm = toPodcastEpisodeFixture({ id: "episode-latest" })
const olderFilm = toPodcastEpisodeFixture({ id: "episode-older" })
const closedSection = { podcastEpisode: latestFilm, isOpen: false }

// put the sign-in and every spy back after each test
afterEach(() => {
	setIsUserSignedIn(false)
	mock.restore()
})

test("a signed-in toggle saves the choice with the latest film, and a visitor's saves nothing", () => {
	// a signed-in user opens the section on one topic
	const send = spyOn(podcastEpisodeClient, "sendTopicPodcastEpisodeVideoSection").mockResolvedValue(true)
	setIsUserSignedIn(true)
	setTopicPodcastEpisodeVideoSectionOpen({ topicId: "topic-a", latestPodcastEpisodeId: "episode-latest", isOpen: true })
	expect(send).toHaveBeenCalledWith({ topicId: "topic-a", podcastEpisodeId: "episode-latest", isOpen: true })
	expect(toTopicPodcastEpisodeVideoSection("topic-a", closedSection).isOpen).toBe(true)

	// a visitor's toggle changes the page and sends nothing
	setIsUserSignedIn(false)
	setTopicPodcastEpisodeVideoSectionOpen({
		topicId: "topic-a",
		latestPodcastEpisodeId: "episode-latest",
		isOpen: false,
	})
	expect(send).toHaveBeenCalledTimes(1)
})

test("a row opens the section on its film, asks for a scroll, and plays the film", () => {
	// a closed section, and a row press on an older film
	const play = spyOn(playerStore, "playTopicPodcastEpisodeVideo").mockResolvedValue(true)
	playInTopicPodcastEpisodeVideoSection("topic-b", olderFilm)

	// the section opens on the older film, asks for one scroll, and plays it
	const section = toTopicPodcastEpisodeVideoSection("topic-b", closedSection)
	expect(section).toMatchObject({ podcastEpisode: { id: "episode-older" }, isOpen: true, scrollRequestCount: 1 })
	expect(play).toHaveBeenCalledWith(olderFilm)

	// another topic reads its own section
	expect(toTopicPodcastEpisodeVideoSection("topic-c", closedSection)).toMatchObject({
		podcastEpisode: { id: "episode-latest" },
		isOpen: false,
		scrollRequestCount: 0,
	})
})
