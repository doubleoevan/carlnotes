// the topic page's film section: open or collapsed as the topic read resolved it, headed "Coffee Break Cinema" with
// the theme song's credits right after the title, with the film player in a card and its skips and speed showing
// before the film plays, with the rendering card in the player's place while the topic's only film renders, the
// filming line under the controls while a newer film renders, and absent for a topic with no film
import { expect, mock, spyOn, test } from "bun:test"
import { toPodcastEpisodeFixture, toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicVideoSection as SharedTopicVideoSection,
	type TopicVideoSectionElements,
} from "@carlnotes/core/components/TopicVideoSection"
import { updatePodcastEpisodePlayerState } from "@carlnotes/core/stores/podcastEpisodePlayerState"
import * as playerStore from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { focusManager } from "@tanstack/react-query"
import { act } from "react"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { renderTestHook } from "@/lib/hookTestHarness"
import { INFO_CARD_CLASS } from "@/lib/styleClasses"
import { TopicVideoSection } from "./TopicVideoSection"

// mount the shared section with its actual polling and player selection
const testElements: TopicVideoSectionElements = {
	Section: ({ children }) => <section>{children}</section>,
	Player: ({ podcastEpisode, cardFooter }) => (
		<article>
			<h4>{podcastEpisode.title}</h4>
			{cardFooter}
		</article>
	),
	RenderingCard: () => <p>Rendering</p>,
	ProgressLine: ({ text }) => <p>{text}</p>,
	NewFilmButton: ({ label, onPress }) => (
		<button type="button" onClick={onPress}>
			{label}
		</button>
	),
}

// the latest film's podcast episode
const filmPodcastEpisode = toPodcastEpisodeFixture({
	title: "Better beans",
	video: {
		videoUrl: "/api/episodes/episode-1/video.mp4",
		captionsUrl: "/api/episodes/episode-1/captions.vtt",
		posterUrl: "/api/topic-podcast-episode-video-images/episode-1/hash/poster.jpg",
	},
})

// a topic whose podcast has a film, or none
function toFilmTopic(hasFilm: boolean): TopicResponse {
	return toTestTopicResponse({
		id: "topic-1",
		podcast: toTopicPodcastFixture({
			latestSeasonPodcastEpisodes: { podcastEpisodes: [filmPodcastEpisode] },
			topicPodcastEpisodeVideoSection: hasFilm ? { podcastEpisode: filmPodcastEpisode } : null,
		}),
	})
}

// the film section's html for a topic
function renderFilmSection(topic: TopicResponse): Promise<string> {
	return renderWithRouter(<TopicVideoSection topic={topic} onVideoRenderingPoll={() => {}} />)
}

for (const playback of ["idle", "playing", "paused", "audio", "removed"] as const) {
	test(`publishing a newer film while the older film is ${playback} switches only an idle poster`, async () => {
		// show the old film while the newer one renders
		const newerFilm = {
			...filmPodcastEpisode,
			id: "new-film",
			episodeNumber: playback === "removed" ? 6 : 8,
			title: "New beans",
		}
		let topic = {
			...toFilmTopic(true),
			latestPodcastEpisode: { ...newerFilm, video: null, isVideoRendering: true },
		} as TopicResponse
		const reload = mock(() => {})
		const play = spyOn(playerStore, "playTopicVideo").mockResolvedValue(true)
		const oldState = playerStore.toPodcastEpisodePlayerState()
		updatePodcastEpisodePlayerState({
			format: playback === "audio" ? "audio" : "video",
			podcastEpisode: playback === "idle" ? null : filmPodcastEpisode,
			isPlaying: playback === "playing" || playback === "audio",
			positionSeconds: 24,
		})
		const harness = await renderTestHook(
			() => topic,
			(shownTopic) => (
				<SharedTopicVideoSection
					topic={shownTopic}
					elements={testElements}
					onToggled={() => {}}
					onVideoRenderingPoll={reload}
				/>
			),
		)
		try {
			// a return to the page polls even with a playable poster still on screen
			await act(async () => {
				focusManager.setFocused(false)
				focusManager.setFocused(true)
			})
			expect(reload).toHaveBeenCalledTimes(1)
			expect(harness.container.querySelector("h4")?.textContent).toBe("Better beans")
			expect(harness.container.querySelector("button")).toBeNull()

			// apply the published page and verify polling stops without touching playback
			topic = {
				...toFilmTopic(true),
				latestPodcastEpisode: newerFilm,
				podcast: toTopicPodcastFixture({ topicPodcastEpisodeVideoSection: { podcastEpisode: newerFilm } }),
			}
			await harness.render()
			await act(async () => {
				focusManager.setFocused(false)
				focusManager.setFocused(true)
			})
			expect(reload).toHaveBeenCalledTimes(1)
			expect(play).not.toHaveBeenCalled()
			expect(playerStore.toPodcastEpisodePlayerState().positionSeconds).toBe(24)

			// only a viewer watching the older film gets the choice to start the new one
			const button = harness.container.querySelector("button")
			if (playback === "playing" || playback === "paused") {
				expect(harness.container.querySelector("h4")?.textContent).toBe("Better beans")
				expect(button?.textContent).toBe("New film ready")
				await act(async () => button?.click())
				expect(play).toHaveBeenCalledWith(newerFilm)
			} else {
				expect(button).toBeNull()
			}
			expect(harness.container.querySelector("h4")?.textContent).toBe("New beans")
		} finally {
			// release the page before restoring playback and focus
			await harness.close()
			updatePodcastEpisodePlayerState(oldState)
			focusManager.setFocused(undefined)
			play.mockRestore()
		}
	})
}

test("a film renders the section open on the film's poster, under a heading without the word video", async () => {
	// the open section, with the poster and the play button over it
	const html = await renderFilmSection(toFilmTopic(true))
	expect(html).toContain("Coffee Break Cinema")
	expect(html).not.toContain("Topic Cinema")
	expect(html).toContain('data-state="open"')
	expect(html).toMatch(/<h4[^>]*>Better beans<\/h4>[\s\S]*?<img[^>]+poster\.jpg/)
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
	const html = await renderFilmSection(toFilmTopic(true))
	expect(html).toMatch(/Coffee Break Cinema<\/span><\/button><\/h3><button[^>]*aria-label="Theme song credits"/)
	expect(html.match(/aria-label="Theme song credits"/g)).toHaveLength(1)
})

test("a topic with no film renders no film section", async () => {
	expect(await renderFilmSection(toFilmTopic(false))).toBe("")
})

test("a topic whose only film is rendering renders the open section with the rendering card and no player", async () => {
	// no ready film, and the latest podcast episode's film is rendering
	const videoRenderingTopic = {
		...toFilmTopic(false),
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
		...toFilmTopic(false),
		latestPodcastEpisode: toPodcastEpisodeFixture({ title: "Better beans", isVideoRendering: false }),
	}
	expect(await renderFilmSection(failedFilmTopic)).toBe("")
})

test("the film card says a newer film is filming under the controls, and says nothing for the shown film", async () => {
	// the latest film, with a newer podcast episode whose film is rendering
	const newerPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-2", isVideoRendering: true })
	const html = await renderFilmSection({ ...toFilmTopic(true), latestPodcastEpisode: newerPodcastEpisode })
	expect(html).toContain('src="/api/topic-podcast-episode-video-images/episode-1/hash/poster.jpg"')
	expect(html.indexOf("Carl and Vienna are filming...")).toBeGreaterThan(html.indexOf('aria-label="Mute"'))

	// the shown film's own podcast episode adds no line
	const shownPodcastEpisode = { ...filmPodcastEpisode, isVideoRendering: true }
	const shownHtml = await renderFilmSection({ ...toFilmTopic(true), latestPodcastEpisode: shownPodcastEpisode })
	expect(shownHtml).not.toContain("Carl and Vienna are filming...")
})
