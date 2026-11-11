// the film render's skips, with the connection pool stubbed: a spent owner gets a failed row, a platform-billed render
// skips the spend check, and a podcast episode missing its inputs gets a failed row once
import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { renderTopicPodcastEpisodeVideo } from "./renderTopicPodcastEpisodeVideo"

// a published podcast episode's row, in the column order the film's read selects: topic, owner, status, title,
// season, number, audio key, script, its image hash, its topic's name, and its topic's image hash
const PUBLISHED_PODCAST_EPISODE_ROW = [
	"topic-1",
	"owner-1",
	"published",
	"Agents that review code",
	2026,
	14,
	null,
	null,
	null,
	"AI Agents",
	null,
]

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// answer the podcast episode read with the published row, and every other read with no rows
function stubPodcastEpisodeReads(): SentQuery[] {
	return stubConnectionPool(({ text }) =>
		text.includes('from "episodes" inner join "topics"') ? [PUBLISHED_PODCAST_EPISODE_ROW] : [],
	)
}

// the film row's write, if the render wrote one
function toFilmRowWrite(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "topic_podcast_episode_videos"'))
}

// an owner past the podcast episode spend cutoff gets no render, and a failed row that the backfill's listing leaves out
test("an owner past the spend cutoff gets a failed film row", async () => {
	// the owner is past the cutoff
	const sentQueries = stubPodcastEpisodeReads()
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	try {
		const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1" })
		expect(renderResult).toEqual({ outcome: "skipped", reason: "spend-cutoff" })
	} finally {
		cutoffSpy.mockRestore()
	}

	// the film row is written failed, with the reason, and never as rendering
	const filmRowWrite = toFilmRowWrite(sentQueries)
	expect(filmRowWrite?.text).toContain('on conflict ("episode_id") do update')
	expect(filmRowWrite?.values).toContain("failed")
	expect(filmRowWrite?.values).toContain("spend-cutoff")
	expect(filmRowWrite?.values).not.toContain("rendering")
})

// the backfill's platform-billed render never asks about the owner's spend, and a podcast episode with no audio or
// chapters gets a failed row that no listing finds again
test("a platform-billed render skips the spend check, and missing inputs write a failed row", async () => {
	// render on the platform's bill a podcast episode with no audio, transcript, or chapters
	const sentQueries = stubPodcastEpisodeReads()
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

	// the render skips the spend check and warns once
	try {
		const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
		expect(renderResult).toEqual({ outcome: "skipped", reason: "missing-inputs" })
		expect(cutoffSpy).not.toHaveBeenCalled()
		expect(warnSpy).toHaveBeenCalledTimes(1)
	} finally {
		// put both spies back
		cutoffSpy.mockRestore()
		warnSpy.mockRestore()
	}

	// the film row is written failed, with the reason
	const filmRowWrite = toFilmRowWrite(sentQueries)
	expect(filmRowWrite?.values).toContain("failed")
	expect(filmRowWrite?.values).toContain("missing-inputs")
})

// a podcast episode that is not published renders nothing
test("an unpublished podcast episode is skipped", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1" })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "unpublished" })
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
})
