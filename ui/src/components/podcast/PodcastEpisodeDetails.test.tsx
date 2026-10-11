// a podcast episode's details line counts its chapters, names the AI voices outside a tooltip, and shows the description
// inside one
import { expect, test } from "bun:test"
import type { PodcastEpisode } from "@shared/contracts/podcast"
import { AI_VOICES_NOTE } from "@shared/podcastEpisodes"
import { renderToStaticMarkup } from "react-dom/server"
import { PodcastEpisodeDetails } from "./PodcastEpisodeDetails"
import { toPodcastEpisodeSummaryFixture } from "./podcastEpisodeTestFixtures"

// a table row's summary of a published podcast episode with twelve chapters
const PODCAST_EPISODE_SUMMARY = toPodcastEpisodeSummaryFixture()

// a podcast episode as the player shows it, with its two chapters
const PODCAST_EPISODE = {
	...PODCAST_EPISODE_SUMMARY,
	chapterCount: 2,
	description: null,
	topicId: "topic-1",
	topicVisibility: "public",
	status: "published",
	audioUrl: "/api/episodes/episode-1/audio.mp3",
	coverUrl: null,
	smallCoverUrl: null,
	chapters: [0, 1].map((position) => ({
		position,
		title: `Chapter ${position + 1}`,
		findingId: null,
		sourceUrl: "https://example.com",
		rating: null,
		faviconPath: null,
		startSeconds: position * 60,
		endSeconds: (position + 1) * 60,
	})),
	progressSeconds: 0,
	isCompleted: false,
} satisfies PodcastEpisode

test("a summary's details line counts its chapters", () => {
	const html = renderToStaticMarkup(<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE_SUMMARY} isInTooltip />)
	expect(html).toContain("Season 2026 · Episode 7")
	expect(html).toContain("12 chapters")
})

test("a full episode's details line counts its chapters", () => {
	const html = renderToStaticMarkup(<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE} isInTooltip />)
	expect(html).toContain("2 chapters")
})

test("the AI voices note shows on the page's details and not in a tooltip's", () => {
	const tooltipHtml = renderToStaticMarkup(
		<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE_SUMMARY} isInTooltip />,
	)
	const pageHtml = renderToStaticMarkup(<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE_SUMMARY} />)
	expect(tooltipHtml).not.toContain(AI_VOICES_NOTE)
	expect(pageHtml).toContain(AI_VOICES_NOTE)
})

test("a tooltip's details end with the description, and the page's details leave it out", () => {
	const tooltipHtml = renderToStaticMarkup(
		<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE_SUMMARY} isInTooltip />,
	)
	const pageHtml = renderToStaticMarkup(<PodcastEpisodeDetails podcastEpisode={PODCAST_EPISODE_SUMMARY} />)
	expect(tooltipHtml).toContain("Six robot vacuums, ranked by how well they find the corners.")
	expect(pageHtml).not.toContain("Six robot vacuums")
})
