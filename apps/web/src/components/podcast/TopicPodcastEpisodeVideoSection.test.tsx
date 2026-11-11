// the topic page's film section: open or collapsed as the topic read resolved it, headed "Coffee Break Cinema" with
// the theme song's credits right after the title, with the film player in a card and its skips and speed showing
// before the film plays, with the rendering card in the player's place while the topic's only film renders, and
// absent for a topic with no film
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { INFO_CARD_CLASS } from "@/lib/styleClasses"
import { TopicPodcastEpisodeVideoSection } from "./TopicPodcastEpisodeVideoSection"

// the latest film's podcast episode
const filmPodcastEpisode = toPodcastEpisodeFixture({
	title: "Better beans",
	video: {
		videoUrl: "/api/episodes/episode-1/video.mp4",
		captionsUrl: "/api/episodes/episode-1/captions.vtt",
		posterUrl: "/api/topic-podcast-episode-video-images/episode-1/hash/poster.jpg",
	},
})

// a topic whose podcast has the film section in the given state, or none
function toFilmTopic(topicPodcastEpisodeVideoSection: { isOpen: boolean } | null): TopicResponse {
	return toTestTopicResponse({
		id: "topic-1",
		podcast: {
			isEnabled: true,
			isCommentsEnabled: true,
			hasFullPodcastEpisodes: true,
			unpublishedPodcastEpisode: null,
			publicFeedUrl: null,
			seasons: [2026],
			latestSeasonPodcastEpisodes: { podcastEpisodes: [filmPodcastEpisode] },
			canRemovePodcastEpisodes: false,
			topicPodcastEpisodeVideoSection: topicPodcastEpisodeVideoSection && {
				podcastEpisode: filmPodcastEpisode,
				...topicPodcastEpisodeVideoSection,
			},
		},
	})
}

// the film section's html for a topic
function renderFilmSection(topic: TopicResponse): Promise<string> {
	return renderWithRouter(<TopicPodcastEpisodeVideoSection topic={topic} onVideoRenderingPoll={() => {}} />)
}

test("an unseen film renders the section open on the film's poster, under a heading without the word video", async () => {
	// the open section, with the poster and the play button over it
	const html = await renderFilmSection(toFilmTopic({ isOpen: true }))
	expect(html).toContain("Coffee Break Cinema")
	expect(html).not.toContain("Topic Cinema")
	expect(html).toContain('data-state="open"')
	expect(html).toContain('src="/api/topic-podcast-episode-video-images/episode-1/hash/poster.jpg"')
	expect(html).toContain('aria-label="Play episode 7"')
	expect(html).not.toMatch(/<h\d[^>]*>[^<]*video/i)

	// the mute control beside captions, and no control that switches to the audio
	expect(html).toContain('aria-label="Mute"')
	expect(html).not.toContain('aria-label="Listen"')

	// the skips and the speed before the film plays, and the card around the film and its controls
	expect(html).toContain('aria-label="Skip back 15 seconds"')
	expect(html).toContain('aria-label="Skip forward 30 seconds"')
	expect(html).toMatch(/aria-label="Playback speed [\d.]+x"/)
	expect(html).toContain(INFO_CARD_CLASS)
})

test("the theme song's credits sit right after the title, outside the section's toggle", async () => {
	// the toggle's button ends at the title, and the credits' button follows the toggle's heading
	const html = await renderFilmSection(toFilmTopic({ isOpen: true }))
	expect(html).toMatch(/Coffee Break Cinema<\/span><\/button><\/h3><button[^>]*aria-label="Theme song credits"/)
	expect(html.match(/aria-label="Theme song credits"/g)).toHaveLength(1)
})

test("a saved close renders the section collapsed, with the player kept for a Coffee Break films row", async () => {
	const html = await renderFilmSection(toFilmTopic({ isOpen: false }))
	expect(html).toContain('data-state="closed"')
	expect(html).toContain('aria-label="Play episode 7"')
})

test("a topic with no film renders no film section", async () => {
	expect(await renderFilmSection(toFilmTopic(null))).toBe("")
})

test("a topic whose only film is rendering renders the open section with the rendering card and no player", async () => {
	// no ready film, and the latest podcast episode's film is rendering
	const videoRenderingTopic = {
		...toFilmTopic(null),
		latestPodcastEpisode: toPodcastEpisodeFixture({ title: "Better beans", isVideoRendering: true }),
	}
	const html = await renderFilmSection(videoRenderingTopic)

	// the section's title over the card's frame, title, and line, whose emoji a screen reader skips
	expect(html).toContain("Coffee Break Cinema")
	expect(html).toContain('data-state="open"')
	expect(html).toContain(INFO_CARD_CLASS)
	expect(html).toContain("Better beans")
	expect(html).toMatch(
		/<span aria-hidden="true"[^>]*>🎬<\/span><span class="shimmer-text">Carl and Vienna are filming...<\/span>/,
	)
	expect(html).not.toContain("Carl and Vienna are recording...")
	expect(html).not.toContain('aria-label="Play episode 7"')
})

test("a failed film on a topic with no ready film renders no film section", async () => {
	const failedFilmTopic = {
		...toFilmTopic(null),
		latestPodcastEpisode: toPodcastEpisodeFixture({ title: "Better beans", isVideoRendering: false }),
	}
	expect(await renderFilmSection(failedFilmTopic)).toBe("")
})
