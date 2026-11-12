// the Dashboard charts' shared rules: a trend day's lines, the podcast count split, a word's times, a pin's detail
// lines, and the series colors
import { expect, test } from "bun:test"
import {
	toDashboardCountColors,
	toDashboardCountLines,
	toDashboardDayLabel,
	toDashboardPointLineGroups,
	toDashboardSeriesColor,
	toDashboardTrendDayPoint,
	toDashboardWordCountLines,
	toDashboardWordPoint,
} from "./dashboardCharts"

test("a trend day lists each line with a count that day, most first, keeping its color and Other's missing page, then its total", () => {
	const trend = {
		days: ["2026-11-08", "2026-11-09"],
		daysPerPoint: 1,
		lines: [
			{ key: "topic-1", title: "Startups", path: "/topics/1", counts: [4, 1] },
			{ key: "topic-2", title: "Coding", path: "/topics/2", counts: [0, 6] },
			{ key: "other", title: "Other", path: null, counts: [2, 3] },
		],
	}
	const seriesColors = ["first", "second", "third"]
	const dayPoint = toDashboardTrendDayPoint({ trend, dayIndex: 1, playFormat: null, seriesColors })
	expect(dayPoint.title).toBe("Nov 9")
	expect(dayPoint.dayLines?.map(({ key, color }) => [key, color])).toEqual([
		["topic-2", "second"],
		["other", "third"],
		["topic-1", "first"],
	])

	// a day leaves out a line with no count, and its detail draws Other with no page
	const firstDayPoint = toDashboardTrendDayPoint({ trend, dayIndex: 0, playFormat: null, seriesColors })
	expect(firstDayPoint.dayLines?.map(({ key }) => key)).toEqual(["topic-1", "other"])
	expect(toDashboardPointLineGroups(dayPoint, null).totalLine).toBe("10 visitors")
	expect(toDashboardPointLineGroups(dayPoint, null).itemLines).toEqual([
		{
			key: "topic-2",
			title: "Coding",
			countLine: "6",
			line: "Coding: 6",
			path: "/topics/2",
			color: "second",
		},
		{ key: "other", title: "Other", countLine: "3", line: "Other: 3", path: null, color: "third" },
		{
			key: "topic-1",
			title: "Startups",
			countLine: "1",
			line: "Startups: 1",
			path: "/topics/1",
			color: "first",
		},
	])
})

test("a weekly trend point is titled by its week's first day", () => {
	const trend = {
		days: ["2026-11-02", "2026-11-09"],
		daysPerPoint: 7,
		lines: [{ key: "topic-1", title: "Startups", path: "/topics/1", counts: [12, 30] }],
	}
	const weekPoint = toDashboardTrendDayPoint({ trend, dayIndex: 1, playFormat: null, seriesColors: ["first"] })
	expect(weekPoint.title).toBe("Week of Nov 9")
	expect(toDashboardPointLineGroups(weekPoint, null).totalLine).toBe("30 visitors")
})

test("a trend day reads in UTC, an unreadable day shows as it is, and the series colors repeat in turn", () => {
	expect(toDashboardDayLabel("2026-01-01")).toBe("Jan 1")
	expect(toDashboardDayLabel("not a day")).toBe("not a day")
	expect([0, 1, 2, 3].map((seriesIndex) => toDashboardSeriesColor(["first", "second"], seriesIndex))).toEqual([
		"first",
		"second",
		"first",
		"second",
	])
})

test("Both splits a podcast count, one format counts plays its selector names, and a view counts visitors", () => {
	const counts = { count: 5, podcastPlayCount: 3, filmPlayCount: 2 }
	expect(toDashboardCountLines(counts, "both")).toEqual(["3 podcast", "2 film"])
	expect(toDashboardCountLines({ count: 3 }, "audio")).toEqual(["3 plays"])
	expect(toDashboardCountLines({ count: 1 }, "video")).toEqual(["1 play"])
	expect(toDashboardCountLines({ count: 12 }, null)).toEqual(["12 visitors"])
})

test("a word's visitors and plays count times", () => {
	expect(toDashboardWordCountLines({ count: 93 }, null)).toEqual(["93 times"])
	expect(toDashboardWordCountLines({ count: 1 }, null)).toEqual(["1 time"])
	expect(toDashboardWordCountLines({ count: 3 }, "audio")).toEqual(["3 times"])
	const wordCounts = { count: 90, podcastPlayCount: 58, filmPlayCount: 32 }
	const wordPoint = { title: "butler", path: null, isWord: true, counts: wordCounts }
	expect(toDashboardPointLineGroups(wordPoint, "both").totalLine).toBe("90 times")
	expect(
		toDashboardPointLineGroups({ title: "startups", path: null, isWord: true, counts: { count: 4 } }, null).lines,
	).toEqual([{ line: "4 times", color: undefined }])

	// a word's point takes its counts from the cloud's words, and a word missing from them counts none
	const dashboardWords = [{ word: "butler", ...wordCounts }]
	expect(toDashboardWordPoint(dashboardWords, "butler")).toMatchObject(wordPoint)
	expect(toDashboardWordPoint(dashboardWords, "espresso").counts).toEqual({ count: 0 })
})

test("a point under Both totals its plays after its split, and a pin totals its own plays in their unit", () => {
	const counts = { count: 5, podcastPlayCount: 3, filmPlayCount: 2 }
	expect(toDashboardPointLineGroups({ title: "Episode", path: null, counts }, "both").totalLine).toBe("5 plays")
	expect(toDashboardPointLineGroups({ title: "Episode", path: null, counts }, "audio").totalLine).toBeNull()

	// a pin's item under Both puts a dot between its podcast and film plays, and its total names each kind
	const item = { itemId: "episode-1", title: "Episode", path: "/podcast-episodes/1", ...counts }
	const pinPoint = { title: "Berlin, Germany", path: null, counts, items: [item] }
	expect(toDashboardPointLineGroups(pinPoint, "both").itemLines[0]?.countLine).toBe("3 podcast · 2 film")
	expect(toDashboardPointLineGroups(pinPoint, "both").totalLine).toBe("3 podcast plays · 2 film plays")
	expect(toDashboardPointLineGroups(pinPoint, "audio").totalLine).toBe("5 plays")
})

test("a pin lists each item there with its visits, then the pin's own visits, items past the list included", () => {
	const item = { itemId: "topic-1", title: "Espresso", path: "/topics/topic-1", count: 4 }
	const pinPoint = { title: "Zürich, Switzerland", path: null, counts: { count: 12 }, items: [item] }
	expect(toDashboardPointLineGroups(pinPoint, null)).toEqual({
		lines: [],
		itemLines: [
			{
				key: "topic-1",
				title: "Espresso",
				countLine: "4",
				line: "Espresso: 4",
				path: "/topics/topic-1",
				color: undefined,
			},
		],
		totalLine: "12 visits",
	})
})

test("a bar's count lines take its segments' colors, and films keep their color without podcasts", () => {
	const seriesColors = ["podcast", "film", "third"]
	expect(toDashboardCountColors("both", seriesColors)).toEqual(["podcast", "film"])
	expect(toDashboardCountColors("video", seriesColors)).toEqual(["film"])
	expect(toDashboardCountColors(null, seriesColors)).toEqual(["podcast"])

	// each count line under Both with its swatch
	const barPoint = {
		title: "Espresso",
		path: "/e/1",
		counts: { count: 5, podcastPlayCount: 3, filmPlayCount: 2 },
		countColors: toDashboardCountColors("both", seriesColors),
	}
	expect(toDashboardPointLineGroups(barPoint, "both").lines).toEqual([
		{ line: "3 podcast", color: "podcast" },
		{ line: "2 film", color: "film" },
	])
})
