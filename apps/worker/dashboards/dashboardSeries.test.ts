// dashboard series tests: the top ten bars, every topic in the pie, findings past ten folded into Other, the trend's
// ranges, its weekly year, and the lines it leaves out, the title words, the pins' item limit, and the podcast split

import { expect, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { type DashboardItemCounts, toDashboardSeries, toRangeDays } from "./dashboardSeries"

// the last completed day every test counts up to, and a day inside the 30 day range but before the 7 day one
const LAST_DAY = "2026-11-10"
const OLD_DAY = "2026-10-21"

// an item with the given count, all of it on the last day, from one city with that many people
function toItemCounts(itemId: string, count: number, title = `Solar ${itemId}`): DashboardItemCounts {
	const place = ZURICH_PLACE
	return {
		itemId,
		title,
		path: `/topics/${itemId}`,
		count,
		dailyCounts: { [LAST_DAY]: { count } },
		placeCounts: [{ place, peopleCount: count, count }],
	}
}

test("the bars rank the top ten, and the pie shows every topic", () => {
	const itemCounts = Array.from({ length: 12 }, (_, i) => toItemCounts(`topic-${i + 1}`, i + 1))
	const series = toDashboardSeries({ itemCounts, isFindingSelection: false, lastCompletedDay: LAST_DAY })
	expect(series.bars.map(({ itemId }) => itemId)).toEqual(Array.from({ length: 10 }, (_, i) => `topic-${12 - i}`))
	expect(series.slices).toHaveLength(12)
	expect(series.trends["30"]?.lines).toHaveLength(12)
})

test("findings past the top ten fold into one Other slice and line", () => {
	const itemCounts = Array.from({ length: 40 }, (_, i) => toItemCounts(`finding-${i + 1}`, 1))
	const series = toDashboardSeries({ itemCounts, isFindingSelection: true, lastCompletedDay: LAST_DAY })
	expect(series.slices).toHaveLength(11)
	expect(series.slices.at(-1)).toMatchObject({ key: "other", path: null, count: 30 })
	expect(series.trends["7"]?.lines.at(-1)?.counts.at(-1)).toBe(30)
})

test("each range holds its completed days ending on the last day, and an uncounted item is left out", () => {
	const series = toDashboardSeries({
		itemCounts: [toItemCounts("topic-1", 3), toItemCounts("topic-2", 0)],
		isFindingSelection: false,
		lastCompletedDay: LAST_DAY,
	})
	expect(Object.keys(series.trends)).toEqual(["7", "30", "90", "365"])
	expect(series.trends["7"]?.days).toEqual(toRangeDays(LAST_DAY, 7))
	expect(series.trends["7"]?.days.at(-1)).toBe(LAST_DAY)
	expect(series.trends["7"]?.lines.map(({ key, counts }) => [key, counts.at(-1)])).toEqual([["topic-1", 3]])
	expect(series.bars.map(({ itemId }) => itemId)).toEqual(["topic-1"])
})

test("the year draws 52 weekly points that sum their days, and 90 days keeps a point per day", () => {
	// a topic counted on the last day and six days before it, inside the last week
	const weekTopic = {
		...toItemCounts("topic-1", 5),
		dailyCounts: { [LAST_DAY]: { count: 3 }, "2026-11-04": { count: 2 } },
	}
	const series = toDashboardSeries({ itemCounts: [weekTopic], isFindingSelection: false, lastCompletedDay: LAST_DAY })

	// the year's last point starts six days before the last day and holds both days' counts
	const yearTrend = series.trends["365"]
	expect(yearTrend?.daysPerPoint).toBe(7)
	expect(yearTrend?.days).toHaveLength(52)
	expect(yearTrend?.days.at(-1)).toBe("2026-11-04")
	expect(yearTrend?.lines[0]?.counts.at(-1)).toBe(5)

	// 90 days keeps its days
	expect(series.trends["90"]?.daysPerPoint).toBe(1)
	expect(series.trends["90"]?.days).toEqual(toRangeDays(LAST_DAY, 90))
})

test("a trend leaves out a line with no count in its range, Other included", () => {
	// a topic counted only on the old day shows in the 30 day trend and not in the 7 day one
	const oldTopic = { ...toItemCounts("topic-2", 1), dailyCounts: { [OLD_DAY]: { count: 1 } } }
	const topicSeries = toDashboardSeries({
		itemCounts: [toItemCounts("topic-1", 3), oldTopic],
		isFindingSelection: false,
		lastCompletedDay: LAST_DAY,
	})
	expect(topicSeries.trends["7"]?.lines.map(({ key }) => key)).toEqual(["topic-1"])
	expect(topicSeries.trends["30"]?.lines.map(({ key }) => key)).toEqual(["topic-1", "topic-2"])

	// a finding past the top ten counted only on the old day adds an Other line to the 30 day trend alone
	const topFindings = Array.from({ length: 10 }, (_, i) => toItemCounts(`finding-${i + 1}`, 5))
	const oldFinding = { ...toItemCounts("finding-11", 1), dailyCounts: { [OLD_DAY]: { count: 1 } } }
	const findingSeries = toDashboardSeries({
		itemCounts: [...topFindings, oldFinding],
		isFindingSelection: true,
		lastCompletedDay: LAST_DAY,
	})
	expect(findingSeries.trends["7"]?.lines.map(({ key }) => key)).not.toContain("other")
	expect(findingSeries.trends["30"]?.lines.at(-1)?.key).toBe("other")
})

test("a word sums the items whose titles hold it, and a city pin lists the items there", () => {
	const series = toDashboardSeries({
		itemCounts: [toItemCounts("topic-1", 12, "Solar panels"), toItemCounts("topic-2", 15, "Solar storage")],
		isFindingSelection: false,
		lastCompletedDay: LAST_DAY,
	})
	expect(series.words.find(({ word }) => word === "solar")?.count).toBe(27)
	expect(series.pins).toHaveLength(1)
	expect(series.pins[0]).toMatchObject({ placeLevel: "city", city: "Zürich", peopleCount: 27, count: 27 })
	expect(series.pins[0]?.items.map(({ itemId }) => itemId)).toEqual(["topic-2", "topic-1"])
})

test("a podcast episode's counts keep the podcast and film split in every chart", () => {
	const episode = {
		...toItemCounts("episode-1", 5),
		podcastPlayCount: 3,
		filmPlayCount: 2,
		dailyCounts: { [LAST_DAY]: { count: 5, podcastPlayCount: 3, filmPlayCount: 2 } },
	}
	const series = toDashboardSeries({ itemCounts: [episode], isFindingSelection: false, lastCompletedDay: LAST_DAY })
	expect(series.bars[0]).toMatchObject({ count: 5, podcastPlayCount: 3, filmPlayCount: 2 })
	expect(series.trends["7"]?.lines[0]?.filmPlayCounts?.at(-1)).toBe(2)
})

test("a trend line leaves out a side of the podcast split with no play in its range", () => {
	const episode = {
		...toItemCounts("episode-1", 3),
		podcastPlayCount: 3,
		filmPlayCount: 0,
		dailyCounts: { [LAST_DAY]: { count: 3, podcastPlayCount: 3, filmPlayCount: 0 } },
	}
	const [line] =
		toDashboardSeries({ itemCounts: [episode], isFindingSelection: false, lastCompletedDay: LAST_DAY }).trends["7"]
			?.lines ?? []
	expect(line?.podcastPlayCounts?.at(-1)).toBe(3)
	expect(line?.filmPlayCounts).toBeUndefined()
})

test("a pin lists its twenty most counted items, and its people and counts sum every item there", () => {
	// twenty five items in one city, each with enough people to show the city
	const itemCounts = Array.from({ length: 25 }, (_, i) => toItemCounts(`topic-${i + 1}`, i + 10))
	const [pin] = toDashboardSeries({ itemCounts, isFindingSelection: false, lastCompletedDay: LAST_DAY }).pins
	expect(pin?.items).toHaveLength(20)
	expect([pin?.items[0]?.count, pin?.items.at(-1)?.count]).toEqual([34, 15])
	expect([pin?.peopleCount, pin?.count]).toEqual([550, 550])
})
