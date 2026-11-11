// podcast episode card tests: the film card's play button after the card's text in place of the audio's beside the
// title, the image each card shows, and the ids and section its open reports
import { expect, test } from "bun:test"
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import { toPodcastEpisodeSummaryFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toPodcastEpisodeImageUrls, toTopicPodcastEpisodeVideoImageUrls } from "@carlnotes/contracts/topicImages"
import { isValidElement, type ReactNode } from "react"
import { PodcastEpisodeCard, type PodcastEpisodeCardElements } from "./PodcastEpisodeCard"

// elements that render nothing, so the test reads the tree the shared card returns
const ELEMENTS: PodcastEpisodeCardElements = {
	Card: () => null,
	Image: () => null,
	Row: () => null,
	Heading: () => null,
	Title: () => null,
	Details: () => null,
	PlayButton: () => null,
	VideoButton: () => null,
	Reactions: () => null,
} as unknown as PodcastEpisodeCardElements

// a podcast episode's own image, and the poster of its film's own image
const PODCAST_EPISODE_IMAGE = toPodcastEpisodeImageUrls("episode-1", "podcast-hash")
const FILM_POSTER_URL = "/api/topic-podcast-episode-video-images/episode-1/film-hash/poster.jpg"

// a podcast episode card whose podcast episode has its own image and a film with its own image
const FILM_PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	podcastEpisode: toPodcastEpisodeSummaryFixture({
		id: "episode-1",
		image: PODCAST_EPISODE_IMAGE,
		hasVideo: true,
		videoPosterUrl: FILM_POSTER_URL,
	}),
	topic: { id: "topic-1", name: "Home espresso", path: "/topics/topic-1/home-espresso", image: null },
	reactionCount: 0,
}

// every element of a type in the tree, with its props
function findElementProps(node: ReactNode, type: unknown): Record<string, unknown>[] {
	// a leaf holds no elements
	if (!isValidElement<{ children?: ReactNode }>(node)) {
		return Array.isArray(node) ? node.flatMap((child) => findElementProps(child, type)) : []
	}

	// this element if it matches, then its children
	const ownProps = node.type === type ? [node.props as Record<string, unknown>] : []
	return [...ownProps, ...findElementProps(node.props.children, type)]
}

test("a film card shows the film's play button in place of the audio's and reports its section", () => {
	const card = PodcastEpisodeCard({
		podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD,
		variant: "video",
		videoSurface: "newest-videos",
		elements: ELEMENTS,
	})
	const videoButtons = findElementProps(card, ELEMENTS.VideoButton)
	expect(videoButtons.map(({ label, surface }) => ({ label, surface }))).toEqual([
		{ label: "Play film", surface: "newest-videos" },
	])
	expect(findElementProps(card, ELEMENTS.PlayButton)).toHaveLength(0)
})

test("a film card's play button is the card's last child, after the title's link, and no button sits beside the title", () => {
	const card = PodcastEpisodeCard({
		podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD,
		variant: "video",
		elements: ELEMENTS,
	})

	// the card's children in order: the image, the text with the title, then the film's play button
	const cardChildren = (card.props as { children: ReactNode[] }).children.filter(isValidElement)
	expect(cardChildren.map((child) => child.type)).toEqual([ELEMENTS.Image, ELEMENTS.Row, ELEMENTS.VideoButton])

	// the text holds the title and no button
	const [, cardText] = cardChildren
	expect(findElementProps(cardText, ELEMENTS.Title)).toHaveLength(1)
	expect(findElementProps(cardText, ELEMENTS.VideoButton)).toHaveLength(0)
})

test("a podcast card of a podcast episode with a film shows play and no film button", () => {
	const card = PodcastEpisodeCard({ podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD, elements: ELEMENTS })
	expect(findElementProps(card, ELEMENTS.VideoButton)).toHaveLength(0)
	expect(findElementProps(card, ELEMENTS.PlayButton)).toHaveLength(1)
})

test("a film card shows the film's own image, and a podcast card the podcast episode's", () => {
	// the film's poster fills every size of the film card's image
	const filmCard = PodcastEpisodeCard({
		podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD,
		variant: "video",
		elements: ELEMENTS,
	})
	expect(findElementProps(filmCard, ELEMENTS.Image)[0]?.image).toEqual(
		toTopicPodcastEpisodeVideoImageUrls(FILM_POSTER_URL),
	)

	// the podcast card of the same podcast episode keeps the podcast episode's image
	const podcastCard = PodcastEpisodeCard({ podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD, elements: ELEMENTS })
	expect(findElementProps(podcastCard, ELEMENTS.Image)[0]?.image).toEqual(PODCAST_EPISODE_IMAGE)
})

test("a film card of a film with no image of its own shows the podcast episode's image", () => {
	const { podcastEpisode } = FILM_PODCAST_EPISODE_CARD
	const filmCard = PodcastEpisodeCard({
		podcastEpisodeCard: { ...FILM_PODCAST_EPISODE_CARD, podcastEpisode: { ...podcastEpisode, videoPosterUrl: null } },
		variant: "video",
		elements: ELEMENTS,
	})
	expect(findElementProps(filmCard, ELEMENTS.Image)[0]?.image).toEqual(PODCAST_EPISODE_IMAGE)
})

test("the film's play button gets only the podcast episode and short codes to report", () => {
	const card = PodcastEpisodeCard({
		podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD,
		variant: "video",
		videoSurface: "home-videos",
		elements: ELEMENTS,
	})
	const [videoButton] = findElementProps(card, ELEMENTS.VideoButton)
	expect(Object.keys(videoButton ?? {}).sort()).toEqual(["label", "podcastEpisode", "surface"])
})
