// the topic page's film section: open, headed "Coffee Break Cinema" with the theme song's credits and the film count.
// it holds every ready film as a card, six to a page, with every card in the html. the filming line sits before the
// count while the latest film renders, and alone if no film is ready. the page is read again until the film is ready,
// and a topic with no film has no section
import { expect, mock, test } from "bun:test"
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicVideoSection as SharedTopicVideoSection,
	type TopicVideoSectionElements,
} from "@carlnotes/core/components/TopicVideoSection"
import { focusManager } from "@tanstack/react-query"
import { act } from "react"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { renderTestHook } from "@/lib/hookTestHarness"
import { TopicVideoSection } from "./TopicVideoSection"

// the shared section with plain elements, for the reads while a film renders
const testElements: TopicVideoSectionElements = {
	Section: ({ action, children }) => (
		<section>
			{action}
			{children}
		</section>
	),
	Grid: ({ children }) => <ol>{children}</ol>,
	Cell: ({ children }) => <li>{children}</li>,
	Pagination: () => null,
	FilmCard: ({ podcastEpisodeCard }) => <h4>{podcastEpisodeCard.podcastEpisode.title}</h4>,
	RenderingLine: () => <p>Rendering</p>,
}

// a topic's film cards, newest first, each named for its episode number
function toFilmCards(filmCount: number): PodcastEpisodeCard[] {
	return Array.from({ length: filmCount }, (_, index) => ({
		podcastEpisode: toPodcastEpisodeFixture({
			id: `episode-${filmCount - index}`,
			episodeNumber: filmCount - index,
			title: `Film ${filmCount - index}`,
			hasVideo: true,
			videoPosterUrl: `/api/topic-podcast-episode-video-images/episode-${filmCount - index}/hash/poster.jpg`,
		}),
		topic: { id: "topic-1", name: "Coffee", path: "/topics/topic-1/coffee", image: null },
		reactionCount: 0,
	}))
}

// a topic with its film cards, and its latest podcast episode
function toFilmTopic({
	filmCount,
	latestPodcastEpisode = null,
}: {
	filmCount: number
	latestPodcastEpisode?: TopicResponse["latestPodcastEpisode"]
}): TopicResponse {
	return toTestTopicResponse({
		id: "topic-1",
		topicPodcastEpisodeVideoCards: toFilmCards(filmCount),
		latestPodcastEpisode,
	})
}

// the film section's html for a topic
function renderFilmSection(topic: TopicResponse): Promise<string> {
	return renderWithRouter(<TopicVideoSection topic={topic} onVideoRenderingPoll={() => {}} />)
}

test("a topic's films render as cards in the open section, under a heading without the word video", async () => {
	// the open section at the film anchor, with its count
	const html = await renderFilmSection(toFilmTopic({ filmCount: 8 }))
	expect(html).toContain("Coffee Break Cinema")
	expect(html).toContain('id="film"')
	expect(html).toContain('data-state="open"')
	expect(html).toContain("8 films")
	expect(html).not.toMatch(/<h\d[^>]*>[^<]*video/i)

	// every film's card with its poster and play button, newest first, kept in the html for a reader without script
	expect(html.match(/aria-label="Play film"/g)).toHaveLength(8)
	expect(html.indexOf("Film 8")).toBeLessThan(html.indexOf("Film 1"))
	expect(html).toContain('src="/api/topic-podcast-episode-video-images/episode-8/hash/poster.jpg"')

	// the page buttons, and no film player
	expect(html).toContain('aria-label="Coffee Break Cinema pages"')
	expect(html).not.toContain('aria-label="Skip back 15 seconds"')
})

test("the theme song's credits sit right after the title, outside the section's toggle", async () => {
	// the toggle's button ends at the title, and the credits' button follows the toggle's heading
	const html = await renderFilmSection(toFilmTopic({ filmCount: 2 }))
	expect(html).toMatch(/Coffee Break Cinema<\/span><\/button><\/h3><button[^>]*aria-label="Theme song credits"/)
	expect(html.match(/aria-label="Theme song credits"/g)).toHaveLength(1)
})

test("a topic with no film renders no film section", async () => {
	expect(await renderFilmSection(toFilmTopic({ filmCount: 0 }))).toBe("")
})

test("a topic whose only film is rendering renders the open section with the filming line and no cards", async () => {
	// no ready film, and the latest podcast episode's film is rendering
	const latestPodcastEpisode = toPodcastEpisodeFixture({ title: "Better beans", isVideoRendering: true })
	const html = await renderFilmSection(toFilmTopic({ filmCount: 0, latestPodcastEpisode }))

	// the section's title and the filming line, whose emoji a screen reader skips, with no filming card
	expect(html).toContain("Coffee Break Cinema")
	expect(html).toContain('data-state="open"')
	expect(html).toMatch(
		/<span aria-hidden="true"[^>]*>🎬<\/span><span class="shimmer-text">Carl and Vienna are filming...<\/span>/,
	)
	expect(html).not.toContain("Better beans")
	expect(html).not.toContain('aria-label="Play film"')
})

test("a failed film on a topic with no ready film renders no film section", async () => {
	const latestPodcastEpisode = toPodcastEpisodeFixture({ title: "Better beans", isVideoRendering: false })
	expect(await renderFilmSection(toFilmTopic({ filmCount: 0, latestPodcastEpisode }))).toBe("")
})

test("the filming line sits once in the title row, after the credits and before the count, and wraps on a phone", async () => {
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-3", title: "New beans", isVideoRendering: true })
	const html = await renderFilmSection(toFilmTopic({ filmCount: 2, latestPodcastEpisode }))

	// one line in the wrapping title row, before the count and the cards, and no filming card
	expect(html.match(/Carl and Vienna are filming/g)).toHaveLength(1)
	expect(html).toContain("max-sm:flex-wrap")
	const lineIndex = html.indexOf("Carl and Vienna are filming")
	expect(lineIndex).toBeLessThan(html.indexOf("2 films"))
	expect(lineIndex).toBeLessThan(html.indexOf('aria-label="Play film"'))
	expect(html).not.toContain("New beans")
	expect(html.match(/aria-label="Play film"/g)).toHaveLength(2)
})

test("the page is read again while a film renders, and the new film joins the cards once it is ready", async () => {
	// two ready films, and a newer podcast episode whose film is rendering
	const renderingPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-3", isVideoRendering: true })
	let topic = toFilmTopic({ filmCount: 2, latestPodcastEpisode: renderingPodcastEpisode })
	const reload = mock(() => {})
	const harness = await renderTestHook(
		() => topic,
		(shownTopic) => (
			<SharedTopicVideoSection topic={shownTopic} onVideoRenderingPoll={reload} elements={testElements} />
		),
	)
	try {
		// a return to the page reads it again
		await act(async () => {
			focusManager.setFocused(false)
			focusManager.setFocused(true)
		})
		expect(reload).toHaveBeenCalledTimes(1)
		expect(harness.container.textContent).toContain("Rendering")

		// the ready film's read drops the filming line, adds the film's card first, and stops the reads
		topic = toFilmTopic({ filmCount: 3, latestPodcastEpisode: { ...renderingPodcastEpisode, isVideoRendering: false } })
		await harness.render()
		await act(async () => {
			focusManager.setFocused(false)
			focusManager.setFocused(true)
		})
		expect(reload).toHaveBeenCalledTimes(1)
		expect(harness.container.textContent).not.toContain("Rendering")
		expect(harness.container.querySelector("h4")?.textContent).toBe("Film 3")
	} finally {
		// release the page before restoring focus
		await harness.close()
		focusManager.setFocused(undefined)
	}
})
