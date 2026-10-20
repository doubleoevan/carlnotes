// podcast episode plan tests: which Findings are planned, their order, whether the podcast episode is short, the
// checks that stop a new podcast episode before it spends, and one read of the month's spend for a plan's two checks
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { FULL_PODCAST_EPISODE_FINDINGS, SHORT_PODCAST_EPISODE_FINDINGS } from "@shared/podcastEpisodes"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import {
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
	toTableRow,
} from "../../db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "../../db/monthlyBudgetCutoffs"
import * as quotas from "../../db/quotas"
import { topics } from "../../db/schema/topics"
import {
	isShortPodcastEpisodePlanned,
	loadPodcastEpisodeSpendSkipReason,
	planPodcastEpisode,
	type TopicFindingRow,
	toPlannedFindings,
} from "./planPodcastEpisode"

// a Topic's Finding from the given Scan, with ids that follow from its name,
// and any score, rating, bookmark, or url Source page flag that the test overrides
function toFindingRow(
	name: string,
	scanId: string,
	topicFindingRowOverrides: Partial<
		Pick<TopicFindingRow, "relevanceScore" | "rating" | "isBookmarked" | "isUrlSourcePage">
	> = {},
): TopicFindingRow {
	return {
		findingId: `finding-${name}`,
		resourceId: `resource-${name}`,
		sourceUrl: `https://a.com/${name}`,
		scanId,
		relevanceScore: topicFindingRowOverrides.relevanceScore ?? 0,
		rating: topicFindingRowOverrides.rating ?? null,
		isBookmarked: topicFindingRowOverrides.isBookmarked ?? false,
		isUrlSourcePage: topicFindingRowOverrides.isUrlSourcePage ?? false,
	}
}

// the names of a full Podcast Episode's planned Findings, which are their ids without the prefix
function toPlannedFindingNames(topicFindingRows: TopicFindingRow[], narratedFindingNames: string[] = []): string[] {
	const narratedResourceIds = new Set(narratedFindingNames.map((name) => `resource-${name}`))
	const plannedFindings = toPlannedFindings({
		topicFindingRows,
		narratedResourceIds,
		scanId: "scan-2",
		maxFindings: FULL_PODCAST_EPISODE_FINDINGS,
	})
	return plannedFindings.map((plannedFinding) => plannedFinding.findingId.replace("finding-", ""))
}

test("toPlannedFindings puts the Scan's Findings first, each group in score order", () => {
	// the rows arrive best first, alternating between an older Scan and this Scan
	const topicFindingRows = [
		toFindingRow("old-best", "scan-1"),
		toFindingRow("new-best", "scan-2"),
		toFindingRow("old-next", "scan-1"),
		toFindingRow("new-next", "scan-2"),
	]
	expect(toPlannedFindingNames(topicFindingRows)).toEqual(["new-best", "new-next", "old-best", "old-next"])
})

test("toPlannedFindings puts a narrated Finding last, even found again, and plans nothing if all were narrated", () => {
	// the Resource was narrated, then filtered out, and this Scan found it again as a new Finding
	const topicFindingRows = [
		toFindingRow("again", "scan-2"),
		toFindingRow("fresh", "scan-2"),
		toFindingRow("old", "scan-1"),
	]
	expect(toPlannedFindingNames(topicFindingRows, ["again", "old"])).toEqual(["fresh", "again", "old"])

	// a Topic whose every Finding was narrated plans nothing
	expect(toPlannedFindingNames(topicFindingRows, ["again", "fresh", "old"])).toEqual([])
})

test("toPlannedFindings stops at fifteen Findings", () => {
	// twenty Findings, the first four from this Scan
	const topicFindingRows = Array.from({ length: 20 }, (_, i) => toFindingRow(String(i), i < 4 ? "scan-2" : "scan-1"))
	const plannedFindingNames = toPlannedFindingNames(topicFindingRows)
	expect(plannedFindingNames).toHaveLength(FULL_PODCAST_EPISODE_FINDINGS)
	expect(plannedFindingNames.slice(0, 5)).toEqual(["0", "1", "2", "3", "4"])
})

test("toPlannedFindings picks the five best of a short Podcast Episode's new Findings", () => {
	// eight new Findings, best first, and an older Finding never narrated
	const newFindingRows = Array.from({ length: 8 }, (_, i) => toFindingRow(String(i), "scan-2"))
	const topicFindingRows = [...newFindingRows, toFindingRow("old", "scan-1")]
	const plannedFindings = toPlannedFindings({
		topicFindingRows,
		narratedResourceIds: new Set(),
		scanId: "scan-2",
		maxFindings: SHORT_PODCAST_EPISODE_FINDINGS,
	})
	const plannedFindingIds = plannedFindings.map((plannedFinding) => plannedFinding.findingId)
	expect(plannedFindingIds).toEqual(["finding-0", "finding-1", "finding-2", "finding-3", "finding-4"])
})

test("toPlannedFindings never plans a Finding rated down, and puts liked and bookmarked ones after the Scan's own", () => {
	// a new Finding rated down, two older Findings never narrated, the lower-scored one bookmarked,
	// and three narrated Findings, the best-scored one unrated, one rated up, and one bookmarked
	const topicFindingRows = [
		toFindingRow("disliked", "scan-2", { rating: "down" }),
		toFindingRow("fresh", "scan-2"),
		toFindingRow("older", "scan-1"),
		toFindingRow("older-bookmarked", "scan-1", { isBookmarked: true }),
		toFindingRow("narrated-best", "scan-1"),
		toFindingRow("narrated-liked", "scan-1", { rating: "up" }),
		toFindingRow("narrated-bookmarked", "scan-1", { isBookmarked: true }),
	]
	const narratedFindingNames = ["narrated-best", "narrated-liked", "narrated-bookmarked"]
	expect(toPlannedFindingNames(topicFindingRows, narratedFindingNames)).toEqual([
		"fresh",
		"older-bookmarked",
		"narrated-liked",
		"narrated-bookmarked",
		"older",
		"narrated-best",
	])
})

test("toPlannedFindings picks by score with bonuses, and a new Finding wins a tie", () => {
	// fifteen new Findings at 0.5, a bookmarked Finding at 0.3 that its bonus ties with the new Findings,
	// and a liked url Source page at 0.2 that its two bonuses raise to 0.6
	const newFindingRows = Array.from({ length: 15 }, (_, i) =>
		toFindingRow(`new-${i}`, "scan-2", { relevanceScore: 0.5 }),
	)
	const topicFindingRows = [
		...newFindingRows,
		toFindingRow("bookmarked-tied", "scan-1", { relevanceScore: 0.3, isBookmarked: true }),
		toFindingRow("liked-source", "scan-1", { relevanceScore: 0.2, rating: "up", isUrlSourcePage: true }),
	]

	// the liked url Source page takes a new Finding's place, and the tied bookmark loses to the new Findings
	const newFindingNames = Array.from({ length: 14 }, (_, i) => `new-${i}`)
	expect(toPlannedFindingNames(topicFindingRows)).toEqual([...newFindingNames, "liked-source"])
})

// put the spied quota checks, the connection pool's own query, and the speech model setting back after each test
const restoreEnvSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL"])
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreEnvSettings()
})

// a paid owner gets a full podcast episode until the billed user's spend passes the full podcast episodes cutoff, a free
// owner always gets a short one, and a row an earlier attempt created keeps the length it was planned at
test("a podcast episode is short past the full podcast episodes cutoff, and a retry keeps its row's length", async () => {
	// a paid owner, and a billed user whose spend is past the cutoff
	const hasFullPodcastEpisodesSpy = spyOn(quotas, "hasFullPodcastEpisodes").mockResolvedValue(true)
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)
	const planOptions = { ownerId: "owner-1", billedUserId: "owner-1" }

	// a first attempt is short, and the cutoff it read is the full podcast episodes one
	expect(await isShortPodcastEpisodePlanned({ existingPodcastEpisode: undefined, ...planOptions })).toBe(true)
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("owner-1", "fullPodcastEpisodes")

	// a retry of a row planned full stays full, whatever the spend did since
	expect(await isShortPodcastEpisodePlanned({ existingPodcastEpisode: { isShort: false }, ...planOptions })).toBe(false)

	// under the cutoff it is full, and a free owner's is short without reading the cutoff
	isMonthlyBudgetCutoffPassedSpy.mockResolvedValue(false)
	expect(await isShortPodcastEpisodePlanned({ existingPodcastEpisode: undefined, ...planOptions })).toBe(false)
	hasFullPodcastEpisodesSpy.mockResolvedValue(false)
	isMonthlyBudgetCutoffPassedSpy.mockClear()
	expect(await isShortPodcastEpisodePlanned({ existingPodcastEpisode: undefined, ...planOptions })).toBe(true)
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
})

// a team member's scan bills the team member, so the podcast episodes cutoff is read for the billed user, never the
// topic owner
test("a new podcast episode stops if the billed user's spend is past the podcast episodes cutoff", async () => {
	// a billed team member whose spend is past the cutoff, on a topic whose owner's spend is under it
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockImplementation(
		async (userId) => userId === "member-1",
	)
	const skipOptions = { topicId: "topic-1", isShortPodcastEpisode: false }

	// the billed team member's cutoff stops the podcast episode, and the owner's spend never comes into it
	expect(await loadPodcastEpisodeSpendSkipReason({ ...skipOptions, billedUserId: "member-1" })).toBe(
		"the billed user's monthly spend is past the podcast episodes cutoff",
	)
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("member-1", "podcastEpisodes")
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalledWith("owner-1", expect.anything())

	// a billed user under the cutoff may record
	expect(await loadPodcastEpisodeSpendSkipReason({ ...skipOptions, billedUserId: "owner-1" })).toBeNull()
})

// a topic records one short podcast episode at a time, so a short one waits without reading the cutoff
test("a new short podcast episode stops while the topic's short one is still recording", async () => {
	// the topic's short podcast episode that is still recording, and a billed user under the cutoff
	stubConnectionPool(({ text }) => (text.includes('from "episodes"') ? [["podcast-episode-1"]] : []))
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		false,
	)

	// the recording short podcast episode stops the new one before the cutoff is read
	expect(
		await loadPodcastEpisodeSpendSkipReason({
			topicId: "topic-1",
			isShortPodcastEpisode: true,
			billedUserId: "owner-1",
		}),
	).toBe("the topic's short podcast episode is still recording")
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
})

// a plan reads the full podcast episodes cutoff and then the podcast episodes cutoff for the same billed user, and the
// two checks share one read of that user's month spend
test("one plan sums the billed user's month spend once", async () => {
	// a succeeded scan of a plus owner's topic with its podcast on, one new Finding, no spend, and no earlier row
	Bun.env.PODCAST_SPEECH_MODEL = "speech-model"
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", isPodcastEnabled: true })
	const findingRow = ["finding-1", "resource-1", "https://a.com/1", "scan-1", 0.5, null, false]
	const queryRowByQueryTextPart: [string, unknown[]][] = [
		["insert into", ["podcast-episode-1"]],
		["sum(", ["0"]],
		['from "users"', PLUS_USER_ACCESS_ROW],
		['from "topics"', topicRow],
		['from "findings"', findingRow],
		['from "scans"', ["succeeded"]],
	]

	// return the row of the first text part that the query includes, and no rows for any other query
	const sentQueries = stubConnectionPool(({ text }) => {
		const queryRow = queryRowByQueryTextPart.find(([queryTextPart]) => text.includes(queryTextPart))?.[1]
		return queryRow ? [queryRow] : []
	})

	// the plan creates a full podcast episode's row, and its two cutoff checks sent one set of month sums
	const podcastEpisodePlan = await planPodcastEpisode({ scanId: "scan-1", topicId: "topic-1", billedUserId: "owner-1" })
	expect(podcastEpisodePlan).toEqual({
		podcastEpisodeId: "podcast-episode-1",
		plannedFindings: [{ findingId: "finding-1", resourceId: "resource-1", sourceUrl: "https://a.com/1" }],
	})
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes("sum("))).toHaveLength(3)
})
