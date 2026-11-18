import { expect, test } from "bun:test"
import {
	FILM_PODCAST_EPISODE,
	FINDINGS_MCP_VIEW_DATA,
	FINDINGS_TOPIC,
	PODCAST_EPISODE_SUMMARY,
	toMcpViewToolResult,
} from "./mcpViewFixtures"
import { withMcpView } from "./mcpViewTestHarness"
import { TEST_SITE_URL } from "./mcpViewTestHost"

test.each([
	{ setting: "in the frame", isFilmInFrame: true },
	{ setting: "outside the frame", isFilmInFrame: false },
])(
	"while films play $setting, a played podcast episode's audio plays and its film shows to match",
	async ({ isFilmInFrame }) => {
		// the podcast episode as the MCP view's data reads it, with its film's files only while films play in the frame
		const { video, ...podcastEpisodeWithNoFilm } = FILM_PODCAST_EPISODE
		const podcastEpisode = isFilmInFrame ? FILM_PODCAST_EPISODE : podcastEpisodeWithNoFilm
		const mcpViewData = {
			...FINDINGS_MCP_VIEW_DATA,
			topic: { ...FINDINGS_TOPIC, latestPodcastEpisode: PODCAST_EPISODE_SUMMARY },
			podcastEpisodes: [podcastEpisode],
		}

		// the findings MCP view with the podcast episode's play button in its header
		await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
			await sendToolResult(toMcpViewToolResult({ mcpViewData }))

			// play the podcast episode's audio, which plays in both
			const recordingName = `episode ${podcastEpisode.episodeNumber}`
			await frame
				.getByRole("button", { name: `Play ${recordingName}` })
				.first()
				.click()
			// the play button turns to pause once the audio plays
			await frame
				.getByRole("button", { name: `Pause ${recordingName}` })
				.first()
				.waitFor()

			// the film player in the frame, with no picture-in-picture, fullscreen, or link to the page
			if (isFilmInFrame) {
				await frame.getByRole("button", { name: "Hide captions" }).waitFor()
				expect(await frame.getByRole("button", { name: "Picture in picture" }).count()).toBe(0)
				expect(await frame.getByRole("button", { name: "Fullscreen" }).count()).toBe(0)
				expect(await frame.getByRole("link", { name: "Watch on CarlNotes" }).count()).toBe(0)
			} else {
				// the link to the film player on the podcast episode's page, and no film player in the frame
				await frame.getByRole("link", { name: "Watch on CarlNotes" }).waitFor()
				expect(await frame.getByRole("button", { name: "Hide captions" }).count()).toBe(0)
			}
		})
	},
)

test("a film in the opaque frame reads and preserves the timestamp of a signed caption", async () => {
	const captionsUrl = TEST_SITE_URL + "/api/episodes/episode-1/captions.vtt?play=test"
	const episode = { ...FILM_PODCAST_EPISODE, video: { ...FILM_PODCAST_EPISODE.video!, captionsUrl } }
	await withMcpView({ mcpView: "findings" }, async ({ page, frame, sendToolResult }) => {
		// Respond as the authorized caption endpoint does to a media request from an opaque origin.
		await page.route(captionsUrl, (route) =>
			route.fulfill({
				contentType: "text/vtt",
				headers: { "Access-Control-Allow-Origin": "null" },
				body: "WEBVTT\n\n00:00:00.200 --> 00:00:04.000\nCarl opens the chapter.\n",
			}),
		)
		await sendToolResult(
			toMcpViewToolResult({
				mcpViewData: {
					...FINDINGS_MCP_VIEW_DATA,
					topic: { ...FINDINGS_TOPIC, latestPodcastEpisode: PODCAST_EPISODE_SUMMARY },
					podcastEpisodes: [episode],
				},
			}),
		)
		const play = frame.getByRole("button", { name: `Play episode ${episode.episodeNumber}`, exact: true })
		await play.first().click()
		await frame.getByRole("button", { name: "Hide captions" }).waitFor()
		await play.last().click()
		const cue = await frame
			.locator("video")
			.first()
			.evaluate(async (element) => {
				const video = element as HTMLVideoElement
				const deadline = Date.now() + 5000
				while (!video.textTracks[0]?.cues?.length && Date.now() < deadline) {
					await new Promise((resolve) => setTimeout(resolve, 25))
				}
				const first = video.textTracks[0]?.cues?.[0] as VTTCue | undefined
				return first && [first.startTime, first.endTime, first.text]
			})
		expect(cue).toEqual([0.2, 4, "Carl opens the chapter."])
	})
})
