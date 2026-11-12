// the minute sweep's copy of the Redis day buffer into the daily view and play counts. each taken row's count is added
// to its daily count row, and its sketch of people merges into the row's saved sketch. a batch reads its rows' saved
// sketches in one query, merges them in one Redis call, and adds each kind in one upsert
import { toChunks } from "@carlnotes/contracts/arrays"
import { type DbTransaction, db } from "@carlnotes/db"
import {
	type DailyCountEntry,
	type DailyPlayCountRow,
	type DailyViewCountRow,
	deleteTakenDailyCountSketches,
	mergeTakenDailyCountSketches,
	returnDailyCountEntries,
	takeDailyCountEntries,
	toPlaceColumns,
	toPlaceKey,
} from "@carlnotes/db/dailyCountBuffer"
import { dailyPlayCounts, dailyViewCounts } from "@carlnotes/db/schema/dailyCounts"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray, or, sql } from "drizzle-orm"

// how many daily count rows one save transaction writes
const SAVE_BATCH_SIZE = 100

// a taken view entry and a taken play entry
type DailyViewCountEntry = DailyCountEntry & { dailyCountRow: DailyViewCountRow }
type DailyPlayCountEntry = DailyCountEntry & { dailyCountRow: DailyPlayCountRow }

// the taken entries that add to one daily count row: the row and its place key, their summed count, and their hash
// fields
type DailyCountRowSave<Row> = { dailyCountRow: Row; placeKey: string; count: number; dailyCountFields: string[] }

// the columns that name a daily view count row and a daily play count row, which a taken row and a saved row both have
type ViewRowKeyColumns = { itemKind: string; itemId: string; day: string; placeKey: string }
type PlayRowKeyColumns = { podcastEpisodeId: string; format: string; day: string; placeKey: string }

/**
 * Takes every buffered daily count row and adds it to Postgres a batch at a time. A batch whose save fails is put back
 * in the buffer for the next sweep, and a play of a deleted podcast episode is dropped.
 */
export async function saveDailyCounts(): Promise<void> {
	const dailyCountEntries = await takeDailyCountEntries()
	if (!dailyCountEntries || dailyCountEntries.length === 0) {
		return
	}

	// drop the plays of podcast episodes deleted since, which have no row to add to
	const savableEntries = await dropDeletedPodcastEpisodePlays(dailyCountEntries)
	for (const dailyCountBatch of toChunks(savableEntries, SAVE_BATCH_SIZE)) {
		// save the batch's views and plays in one transaction, then drop its taken sketches
		try {
			await db.transaction(async (transaction) => {
				await saveDailyViewCounts(
					transaction,
					dailyCountBatch.filter(
						(dailyCountEntry): dailyCountEntry is DailyViewCountEntry =>
							dailyCountEntry.dailyCountRow.dailyCountKind === "view",
					),
				)
				await saveDailyPlayCounts(
					transaction,
					dailyCountBatch.filter(
						(dailyCountEntry): dailyCountEntry is DailyPlayCountEntry =>
							dailyCountEntry.dailyCountRow.dailyCountKind === "play",
					),
				)
			})
			await deleteTakenDailyCountSketches(dailyCountBatch)
		} catch (error) {
			// report the failed batch and put it back for the next sweep
			console.error("could not save the daily counts", error)
			reportError(error, "database", { dailyCountRowCount: String(dailyCountBatch.length) })
			await returnDailyCountEntries(dailyCountBatch)
		}
	}
}

// the entries left once the plays of deleted podcast episodes are dropped, along with their taken sketches
async function dropDeletedPodcastEpisodePlays(dailyCountEntries: DailyCountEntry[]): Promise<DailyCountEntry[]> {
	const podcastEpisodeIds = [
		...new Set(
			dailyCountEntries.flatMap(({ dailyCountRow }) =>
				dailyCountRow.dailyCountKind === "play" ? [dailyCountRow.podcastEpisodeId] : [],
			),
		),
	]
	if (podcastEpisodeIds.length === 0) {
		return dailyCountEntries
	}

	// the podcast episodes that still exist
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
	const existingPodcastEpisodeIds = new Set(podcastEpisodeRows.map(({ id }) => id))

	// keep the views and the plays whose podcast episode still exists, and drop the other plays' sketches
	const isSavable = ({ dailyCountRow }: DailyCountEntry): boolean =>
		dailyCountRow.dailyCountKind === "view" || existingPodcastEpisodeIds.has(dailyCountRow.podcastEpisodeId)
	await deleteTakenDailyCountSketches(dailyCountEntries.filter((dailyCountEntry) => !isSavable(dailyCountEntry)))
	return dailyCountEntries.filter(isSavable)
}

// add a batch's taken view rows to their daily count rows, and save the merged sketch of each row's viewers
async function saveDailyViewCounts(transaction: DbTransaction, viewEntries: DailyViewCountEntry[]): Promise<void> {
	const rowSaveByKey = toDailyCountRowSaves(viewEntries, toViewRowKey)
	if (rowSaveByKey.size === 0) {
		return
	}

	// the rows' saved sketches, locked until the batch commits, merged with the taken ones
	const rowSaves = [...rowSaveByKey.values()]
	const savedRows = await transaction
		.select({
			itemKind: dailyViewCounts.itemKind,
			itemId: dailyViewCounts.itemId,
			day: dailyViewCounts.day,
			placeKey: dailyViewCounts.placeKey,
			savedSketch: dailyViewCounts.viewerSketch,
		})
		.from(dailyViewCounts)
		.where(
			or(
				...rowSaves.map(({ dailyCountRow, placeKey }) =>
					and(
						eq(dailyViewCounts.itemKind, dailyCountRow.itemKind),
						eq(dailyViewCounts.itemId, dailyCountRow.itemId),
						eq(dailyViewCounts.day, dailyCountRow.day),
						eq(dailyViewCounts.placeKey, placeKey),
					),
				),
			),
		)
		.for("update")
	const mergedSketches = await toMergedSketches(
		rowSaveByKey,
		new Map(savedRows.map((savedRow) => [toViewRowKey(savedRow), savedRow.savedSketch])),
	)

	// add the views to each row, or insert it
	await transaction
		.insert(dailyViewCounts)
		.values(
			rowSaves.map(({ dailyCountRow: { itemKind, itemId, day, place }, placeKey, count }, i) => ({
				itemKind,
				itemId,
				day,
				placeKey,
				...toPlaceColumns(place),
				viewCount: count,
				viewerSketch: mergedSketches[i] ?? null,
			})),
		)
		.onConflictDoUpdate({
			target: [dailyViewCounts.itemKind, dailyViewCounts.itemId, dailyViewCounts.day, dailyViewCounts.placeKey],
			set: {
				viewCount: sql`${dailyViewCounts.viewCount} + excluded.view_count`,
				viewerSketch: sql`excluded.viewer_sketch`,
			},
		})
}

// add a batch's taken play rows to their daily count rows, and save the merged sketch of each row's listeners
async function saveDailyPlayCounts(transaction: DbTransaction, playEntries: DailyPlayCountEntry[]): Promise<void> {
	const rowSaveByKey = toDailyCountRowSaves(playEntries, toPlayRowKey)
	if (rowSaveByKey.size === 0) {
		return
	}

	// the rows' saved sketches, locked until the batch commits, merged with the taken ones
	const rowSaves = [...rowSaveByKey.values()]
	const savedRows = await transaction
		.select({
			podcastEpisodeId: dailyPlayCounts.podcastEpisodeId,
			format: dailyPlayCounts.format,
			day: dailyPlayCounts.day,
			placeKey: dailyPlayCounts.placeKey,
			savedSketch: dailyPlayCounts.listenerSketch,
		})
		.from(dailyPlayCounts)
		.where(
			or(
				...rowSaves.map(({ dailyCountRow, placeKey }) =>
					and(
						eq(dailyPlayCounts.podcastEpisodeId, dailyCountRow.podcastEpisodeId),
						eq(dailyPlayCounts.format, dailyCountRow.format),
						eq(dailyPlayCounts.day, dailyCountRow.day),
						eq(dailyPlayCounts.placeKey, placeKey),
					),
				),
			),
		)
		.for("update")
	const mergedSketches = await toMergedSketches(
		rowSaveByKey,
		new Map(savedRows.map((savedRow) => [toPlayRowKey(savedRow), savedRow.savedSketch])),
	)

	// add the plays to each row, or insert it
	await transaction
		.insert(dailyPlayCounts)
		.values(
			rowSaves.map(({ dailyCountRow: { podcastEpisodeId, format, day, place }, placeKey, count }, i) => ({
				podcastEpisodeId,
				format,
				day,
				placeKey,
				...toPlaceColumns(place),
				playCount: count,
				listenerSketch: mergedSketches[i] ?? null,
			})),
		)
		.onConflictDoUpdate({
			target: [dailyPlayCounts.podcastEpisodeId, dailyPlayCounts.format, dailyPlayCounts.day, dailyPlayCounts.placeKey],
			set: {
				playCount: sql`${dailyPlayCounts.playCount} + excluded.play_count`,
				listenerSketch: sql`excluded.listener_sketch`,
			},
		})
}

// a batch's entries grouped by the daily count row they add to, with their counts summed, so one upsert never names a
// row twice
function toDailyCountRowSaves<Row extends DailyViewCountRow | DailyPlayCountRow>(
	dailyCountEntries: (DailyCountEntry & { dailyCountRow: Row })[],
	toRowKey: (rowKeyColumns: Row & { placeKey: string }) => string,
): Map<string, DailyCountRowSave<Row>> {
	const rowSaveByKey = new Map<string, DailyCountRowSave<Row>>()
	for (const { dailyCountRow, count, dailyCountField } of dailyCountEntries) {
		const placeKey = toPlaceKey(dailyCountRow.place)
		const rowKey = toRowKey({ ...dailyCountRow, placeKey })

		// add the entry to its row's save, or start the save
		const rowSave = rowSaveByKey.get(rowKey)
		if (rowSave) {
			rowSave.count += count
			rowSave.dailyCountFields.push(dailyCountField)
		} else {
			rowSaveByKey.set(rowKey, { dailyCountRow, placeKey, count, dailyCountFields: [dailyCountField] })
		}
	}

	// every row's save, in the order the batch first named the row
	return rowSaveByKey
}

// each row's saved sketch merged with its taken ones, in the saves' order, throwing an error if Redis fails
async function toMergedSketches(
	rowSaveByKey: Map<string, DailyCountRowSave<unknown>>,
	savedSketchByKey: Map<string, Uint8Array | null>,
): Promise<(Uint8Array | null)[]> {
	const mergedSketches = await mergeTakenDailyCountSketches(
		[...rowSaveByKey].map(([rowKey, { dailyCountFields }]) => ({
			savedSketch: savedSketchByKey.get(rowKey) ?? null,
			dailyCountFields,
		})),
	)
	if (!mergedSketches) {
		throw new Error("could not merge the daily count sketches in Redis")
	}
	return mergedSketches
}

// the key that names a daily view count row
function toViewRowKey({ itemKind, itemId, day, placeKey }: ViewRowKeyColumns): string {
	return JSON.stringify([itemKind, itemId, day, placeKey])
}

// the key that names a daily play count row
function toPlayRowKey({ podcastEpisodeId, format, day, placeKey }: PlayRowKeyColumns): string {
	return JSON.stringify([podcastEpisodeId, format, day, placeKey])
}
