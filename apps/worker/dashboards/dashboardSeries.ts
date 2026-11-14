// every Dashboard chart's series for one selection, built from each item's counts: the top ten bars, the pie and the
// trend with Other for findings past the top ten, the title words, and a map pin per place. a snapshot keeps only what
// the charts draw: no trend line with no count in its range, a point per week past 90 days, and each pin's most
// counted items
import {
	DASHBOARD_TOP_ITEM_COUNT,
	type DashboardPin,
	type DashboardSeries,
	type DashboardSlice,
	type DashboardTrend,
	type DashboardTrendLine,
	type DashboardWord,
	dashboardRangeDays,
} from "@carlnotes/contracts/dashboards"
import { DAY_MS, toUtcDay } from "@carlnotes/contracts/time"
import {
	type DashboardCount,
	sumDashboardCounts,
	sumPeopleCounts,
	toDashboardCountFields,
} from "@carlnotes/core/lib/dashboardCounts"
import { groupBy } from "@carlnotes/core/lib/groupBy"
import { toTitleWords, toTopWords } from "@carlnotes/core/lib/wordCloud"
import { type PlaceCount, type ShownPlace, toShownPlaces } from "./shownPlaces"

// one item's counts over the window: its id, plain-text title, and path, its total, its count per completed UTC day as
// YYYY-MM-DD, and its people and count per place
export type DashboardItemCounts = DashboardCount & {
	itemId: string
	title: string
	path: string
	dailyCounts: Record<string, DashboardCount>
	placeCounts: PlaceCount[]
}

// the items' counts, whether the selection is findings, which fold past the top ten, and the last completed day
type ToDashboardSeriesOptions = {
	itemCounts: DashboardItemCounts[]
	isFindingSelection: boolean
	lastCompletedDay: string
}

// the key and the title of the slice and the line that hold every finding past the top ten
const OTHER_SERIES_KEY = "other"
const OTHER_TITLE = "Other"

// how many items a pin lists, the most counted there first. its counts still sum every item
const PIN_ITEM_LIMIT = 20

// the longest range the trend draws a point per day, and the days a weekly point counts past it
const DAILY_RANGE_MAX_DAYS = 90
const WEEK_DAYS = 7

/**
 * Returns every chart's series for one selection. Items with no count in the window are left out of every chart.
 */
export function toDashboardSeries({
	itemCounts,
	isFindingSelection,
	lastCompletedDay,
}: ToDashboardSeriesOptions): DashboardSeries {
	const countedItems = itemCounts
		.filter(({ count }) => count > 0)
		.sort((first, second) => second.count - first.count || first.title.localeCompare(second.title))

	// the bars rank the top ten, and the pie and trend fold findings past the top ten into Other
	const bars = countedItems
		.slice(0, DASHBOARD_TOP_ITEM_COUNT)
		.map((countedItem) => ({ ...toItemFields(countedItem), ...toDashboardCountFields(countedItem) }))
	const shownItems = isFindingSelection ? countedItems.slice(0, DASHBOARD_TOP_ITEM_COUNT) : countedItems
	const foldedItems = isFindingSelection ? countedItems.slice(DASHBOARD_TOP_ITEM_COUNT) : []
	return {
		bars,
		slices: toSlices(shownItems, foldedItems),
		trends: Object.fromEntries(
			dashboardRangeDays.map((rangeDays) => [
				String(rangeDays),
				toTrend({ shownItems, foldedItems, points: toRangePoints(lastCompletedDay, rangeDays) }),
			]),
		),
		words: toWords(countedItems),
		pins: toPins(countedItems),
	}
}

/**
 * Returns the completed UTC days of a range ending on the last completed day, oldest first.
 */
export function toRangeDays(lastCompletedDay: string, rangeDays: number): string[] {
	const lastCompletedDayMs = Date.parse(`${lastCompletedDay}T00:00:00Z`)
	return Array.from({ length: rangeDays }, (_, i) =>
		toUtcDay(new Date(lastCompletedDayMs - (rangeDays - 1 - i) * DAY_MS)),
	)
}

/**
 * Returns the first completed UTC day of a range ending on the last completed day.
 */
export function toRangeFirstDay(lastCompletedDay: string, rangeDays: number): string {
	return toUtcDay(new Date(Date.parse(`${lastCompletedDay}T00:00:00Z`) - (rangeDays - 1) * DAY_MS))
}

// a range's trend points, oldest first, each as the completed days it counts: a point per day up to 90 days, and past
// that a point per whole week, the last ending on the last completed day. the year draws 52 weeks
function toRangePoints(lastCompletedDay: string, rangeDays: number): string[][] {
	if (rangeDays <= DAILY_RANGE_MAX_DAYS) {
		return toRangeDays(lastCompletedDay, rangeDays).map((day) => [day])
	}

	// the whole weeks' days, cut into weeks
	const weekCount = Math.floor(rangeDays / WEEK_DAYS)
	const weekDays = toRangeDays(lastCompletedDay, weekCount * WEEK_DAYS)
	return Array.from({ length: weekCount }, (_, i) => weekDays.slice(i * WEEK_DAYS, (i + 1) * WEEK_DAYS))
}

// an item's id, title, and path
function toItemFields({ itemId, title, path }: DashboardItemCounts): { itemId: string; title: string; path: string } {
	return { itemId, title, path }
}

// a slice per shown item, then one Other slice for the folded items if any counted
function toSlices(shownItems: DashboardItemCounts[], foldedItems: DashboardItemCounts[]): DashboardSlice[] {
	const slices = shownItems.map((shownItem) => ({
		key: shownItem.itemId,
		title: shownItem.title,
		path: shownItem.path,
		...toDashboardCountFields(shownItem),
	}))
	if (foldedItems.length === 0) {
		return slices
	}
	return [...slices, { key: OTHER_SERIES_KEY, title: OTHER_TITLE, path: null, ...sumDashboardCounts(foldedItems) }]
}

// the shown items, the folded items, and the range's points, each as the days it counts
type ToTrendOptions = { shownItems: DashboardItemCounts[]; foldedItems: DashboardItemCounts[]; points: string[][] }

// one range's lines, a line per shown item and one Other line for the folded items, each left out with no count in
// the range
function toTrend({ shownItems, foldedItems, points }: ToTrendOptions): DashboardTrend {
	// a line per shown item
	const itemLines = shownItems.map((shownItem) =>
		toTrendLine(
			{ key: shownItem.itemId, title: shownItem.title, path: shownItem.path },
			points,
			(day) => shownItem.dailyCounts[day] ?? { count: 0 },
		),
	)

	// the Other line, then every line with a count in the range
	const otherLines = foldedItems.length === 0 ? [] : [toOtherTrendLine(foldedItems, points)]
	const lines = [...itemLines, ...otherLines].filter(({ counts }) => counts.some(isPositive))
	return { days: points.map(([firstDay = ""]) => firstDay), daysPerPoint: points[0]?.length ?? 1, lines }
}

// the Other line, the folded items' counts summed each day
function toOtherTrendLine(foldedItems: DashboardItemCounts[], points: string[][]): DashboardTrendLine {
	return toTrendLine({ key: OTHER_SERIES_KEY, title: OTHER_TITLE, path: null }, points, (day) =>
		sumDashboardCounts(foldedItems.map(({ dailyCounts }) => dailyCounts[day] ?? { count: 0 })),
	)
}

// one line's counts across the points, each point its days summed, with each side of the podcast and film split that
// has a play in the range
function toTrendLine(
	seriesKey: Pick<DashboardTrendLine, "key" | "title" | "path">,
	points: string[][],
	toDayCount: (day: string) => DashboardCount,
): DashboardTrendLine {
	const pointCounts = points.map((pointDays) => sumDashboardCounts(pointDays.map(toDayCount)))
	const podcastPlayCounts = pointCounts.map(({ podcastPlayCount = 0 }) => podcastPlayCount)
	const filmPlayCounts = pointCounts.map(({ filmPlayCount = 0 }) => filmPlayCount)
	return {
		...seriesKey,
		counts: pointCounts.map(({ count }) => count),
		...(podcastPlayCounts.some(isPositive) && { podcastPlayCounts }),
		...(filmPlayCounts.some(isPositive) && { filmPlayCounts }),
	}
}

// whether a count is above zero
function isPositive(count: number): boolean {
	return count > 0
}

// the title words, each with the summed count of the items whose titles hold it, up to the word limit
function toWords(countedItems: DashboardItemCounts[]): DashboardWord[] {
	// each title word with its item, grouped by word, and each word's items summed
	const titleWords = countedItems.flatMap((countedItem) =>
		toTitleWords(countedItem.title).map((word) => ({ word, countedItem })),
	)
	const titleWordsByWord = groupBy(titleWords, ({ word }) => word)
	const countByWord = new Map(
		[...titleWordsByWord].map(([word, wordTitleWords]) => [
			word,
			sumDashboardCounts(wordTitleWords.map(({ countedItem }) => countedItem)),
		]),
	)

	// keep the heaviest
	const topWords = toTopWords([...countByWord].map(([word, { count }]) => ({ word, count })))
	return topWords.map(({ word }) => ({ word, ...(countByWord.get(word) ?? { count: 0 }) }))
}

// one item's place as the map shows it, which joins that place's pin
type ItemPlace = { countedItem: DashboardItemCounts; shownPlace: ShownPlace }

// the map pins: each item's shown places on their own, then merged by place, with the items there
function toPins(countedItems: DashboardItemCounts[]): DashboardPin[] {
	// every item's shown places, grouped by place into one pin each
	const itemPlaces = countedItems.flatMap((countedItem) =>
		toShownPlaces(countedItem.placeCounts).map((shownPlace): ItemPlace => ({ countedItem, shownPlace })),
	)
	const itemPlacesByPlace = groupBy(itemPlaces, ({ shownPlace }) => {
		const { placeLevel, country, region, city, postalCode, latitude, longitude } = shownPlace
		return [placeLevel, country, region, city, postalCode, latitude, longitude].join("|")
	})
	return [...itemPlacesByPlace.values()].map(toPin)
}

// one place's pin: the people and counts of every item there summed, and the items most counted there up to the limit
function toPin(itemPlaces: [ItemPlace, ...ItemPlace[]]): DashboardPin {
	// the place, and each item's shown place there
	const { placeLevel, country, region, city, postalCode, latitude, longitude } = itemPlaces[0].shownPlace
	const shownPlaces = itemPlaces.map(({ shownPlace }) => shownPlace)

	// the items there with their own counts there, most counted first, up to the limit
	const placeItems = itemPlaces.map(({ countedItem, shownPlace }) => ({
		...toItemFields(countedItem),
		...toDashboardCountFields(shownPlace),
	}))
	const rankedItems = placeItems.sort((first, second) => second.count - first.count)
	return {
		placeLevel,
		country,
		region,
		city,
		postalCode,
		latitude,
		longitude,
		peopleCount: sumPeopleCounts(shownPlaces),
		...sumDashboardCounts(shownPlaces),
		items: rankedItems.slice(0, PIN_ITEM_LIMIT),
	}
}
