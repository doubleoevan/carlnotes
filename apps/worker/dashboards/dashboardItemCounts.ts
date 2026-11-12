// each item's counts from its daily count rows: a view's count is its distinct viewers, unioned through the sketches,
// and a play's count is its plays summed, split into podcast plays and film plays
import type { DashboardCount } from "@carlnotes/core/lib/dashboardCounts"
import { countSketchGroups } from "@carlnotes/db/dailyCountBuffer"
import type { DashboardDailyCountRow } from "./dashboardDailyCountRows"
import type { DashboardItemCounts } from "./dashboardSeries"
import type { PlaceCount } from "./shownPlaces"

// one item's counts and whether anyone may see it
export type CountedItem = { itemCounts: DashboardItemCounts; isPublic: boolean }

// one item's rows, grouped by day and by known place
type ItemRowGroups = {
	itemRows: DashboardDailyCountRow[]
	rowsByDay: Map<string, DashboardDailyCountRow[]>
	placeRowGroups: DashboardDailyCountRow[][]
}

// one selection's daily count rows, and whether they count plays
type ToCountedItemsOptions = { dailyCountRows: DashboardDailyCountRow[]; isDailyPlayCount: boolean }

/**
 * Returns each item's counts from its daily count rows, or null if Redis fails to count the sketches.
 */
export async function toCountedItems({
	dailyCountRows,
	isDailyPlayCount,
}: ToCountedItemsOptions): Promise<CountedItem[] | null> {
	// group each item's rows by day and by known place
	const itemRowGroups = [...Map.groupBy(dailyCountRows, ({ itemId }) => itemId).values()].map((itemRows) => ({
		itemRows,
		rowsByDay: Map.groupBy(itemRows, ({ day }) => day),
		placeRowGroups: [...Map.groupBy(itemRows, ({ placeKey }) => placeKey).values()].filter((rows) => rows[0]?.place),
	}))

	// count the people of each row group, in the order they are read back: a view item's whole window and each day,
	// then every item's places
	const peopleCounts = await countRowGroups(
		itemRowGroups.flatMap(({ itemRows, rowsByDay, placeRowGroups }) => [
			...(isDailyPlayCount ? [] : [itemRows, ...rowsByDay.values()]),
			...placeRowGroups,
		]),
	)
	if (!peopleCounts) {
		return null
	}

	// read the counts back in the same order
	let countIndex = 0
	const readPeopleCount = (): number => peopleCounts[countIndex++] ?? 0
	return itemRowGroups.map((rowGroups) => toCountedItem({ ...rowGroups, isDailyPlayCount, readPeopleCount }))
}

/**
 * Returns the distinct people of each group of daily count rows, unioned through the rows' sketches with each sketch
 * written once, or null if Redis fails.
 */
export function countRowGroups(rowGroups: DashboardDailyCountRow[][]): Promise<number[] | null> {
	const sketchRows = [...new Set(rowGroups.flat())].filter(({ sketch }) => sketch)
	const sketchIndexByRow = new Map(sketchRows.map((dailyCountRow, i) => [dailyCountRow, i]))
	return countSketchGroups(
		sketchRows.map(({ sketch }) => sketch ?? new Uint8Array()),
		rowGroups.map((rows) => rows.flatMap((dailyCountRow) => sketchIndexByRow.get(dailyCountRow) ?? [])),
	)
}

// one item's row groups, whether they count plays, and the next counted group's people
type ToCountedItemOptions = ItemRowGroups & { isDailyPlayCount: boolean; readPeopleCount: () => number }

// one item's counts: a view's viewers over the window, per day, and per place, or a play's sums with its people per
// place
function toCountedItem({
	itemRows,
	rowsByDay,
	placeRowGroups,
	isDailyPlayCount,
	readPeopleCount,
}: ToCountedItemOptions): CountedItem {
	const itemCount = isDailyPlayCount ? toPlayCount(itemRows) : { count: readPeopleCount() }
	const dailyCounts = Object.fromEntries(
		[...rowsByDay].map(([day, rows]) => [day, isDailyPlayCount ? toPlayCount(rows) : { count: readPeopleCount() }]),
	)

	// each known place's people, which a view counts as its viewers and a play counts beside its plays
	const placeCounts = placeRowGroups.map((rows): PlaceCount => {
		const peopleCount = readPeopleCount()
		const place = rows[0]?.place ?? { country: "", region: null, city: null, latitude: null, longitude: null }
		return { place, peopleCount, ...(isDailyPlayCount ? toPlayCount(rows) : { count: peopleCount }) }
	})

	// the item's fields from its first row, and a play's path from its format with more plays
	const [firstRow] = itemRows
	const path = isDailyPlayCount ? toPlayItemPath(itemRows) : (firstRow?.path ?? "")
	const itemFields = { itemId: firstRow?.itemId ?? "", title: firstRow?.title ?? "", path }
	return {
		itemCounts: { ...itemFields, ...itemCount, dailyCounts, placeCounts },
		isPublic: firstRow?.isPublic ?? false,
	}
}

/**
 * Returns a played item's path from a row of its format with more plays, podcasts on a tie, which opens a topic's
 * podcast episode at the film or at the podcast player.
 */
export function toPlayItemPath(itemRows: DashboardDailyCountRow[]): string {
	const { podcastPlayCount = 0, filmPlayCount = 0 } = toPlayCount(itemRows)
	const largerFormat = filmPlayCount > podcastPlayCount ? "video" : "audio"
	return (itemRows.find(({ format }) => format === largerFormat) ?? itemRows[0])?.path ?? ""
}

/**
 * Returns play rows summed, split into podcast plays and film plays.
 */
export function toPlayCount(dailyCountRows: DashboardDailyCountRow[]): DashboardCount {
	const podcastPlayCount = sumRowCounts(dailyCountRows.filter(({ format }) => format === "audio"))
	const filmPlayCount = sumRowCounts(dailyCountRows.filter(({ format }) => format === "video"))
	return { count: podcastPlayCount + filmPlayCount, podcastPlayCount, filmPlayCount }
}

// rows' counts summed
function sumRowCounts(dailyCountRows: DashboardDailyCountRow[]): number {
	return dailyCountRows.reduce((sum, { count }) => sum + count, 0)
}
