// one Dashboard's nightly snapshots: every selection's series and the summary, at the public level and, if it differs,
// the full level, written with a content hash so an unchanged snapshot keeps its paragraph and share image

import {
	DASHBOARD_WINDOW_DAYS,
	type DashboardAccessLevel,
	type DashboardSelection,
	type DashboardSubject,
	viewItemKinds,
} from "@carlnotes/contracts/dashboards"
import { podcastEpisodeFormats } from "@carlnotes/contracts/podcast"
import { db } from "@carlnotes/db"
import { readDashboardSnapshotGeneration, toDashboardSnapshotFilter } from "@carlnotes/db/dashboardSnapshotRows"
import { dashboardSnapshots } from "@carlnotes/db/schema/dashboards"
import { inArray } from "drizzle-orm"
import { type DashboardDailyCountRow, loadDailyPlayCountRows, loadDailyViewCountRows } from "./dashboardDailyCountRows"
import { type CountedItem, toCountedItems } from "./dashboardItemCounts"
import { toDashboardSeries, toRangeFirstDay } from "./dashboardSeries"
import { loadDashboardSummaries } from "./dashboardSummaries"

// one snapshot to write: its selection, its access level, and its body
type BuiltSnapshot = { selection: DashboardSelection; accessLevel: DashboardAccessLevel; body: unknown }

/**
 * Builds and writes one Dashboard's snapshots for the window ending on the last completed day, deletes any snapshot
 * it no longer builds, and returns the access levels whose summary changed. A build whose snapshots were deleted while
 * it loaded writes nothing and returns none.
 */
export async function buildDashboardSnapshots(
	subject: DashboardSubject,
	lastDay: string,
): Promise<DashboardAccessLevel[]> {
	// the snapshot generation before the daily counts load, and the window
	const snapshotGeneration = await readDashboardSnapshotGeneration(subject)
	const firstDay = toRangeFirstDay(lastDay, DASHBOARD_WINDOW_DAYS)
	const loadOptions = { subject, firstDay, lastDay }
	const isDailyPlayCount = subject.dashboardKind === "podcastDashboard"

	// every selection's rows: the three item kinds' views, or each format's plays and both
	const rowsBySelection = new Map<DashboardSelection, DashboardDailyCountRow[]>()
	if (isDailyPlayCount) {
		const playRows = await loadDailyPlayCountRows("both", loadOptions)
		for (const format of podcastEpisodeFormats) {
			rowsBySelection.set(
				format,
				playRows.filter((playRow) => playRow.format === format),
			)
		}
		rowsBySelection.set("both", playRows)
	} else {
		for (const itemKind of viewItemKinds) {
			rowsBySelection.set(itemKind, await loadDailyViewCountRows(itemKind, loadOptions))
		}
	}

	// each selection's series at both levels
	const builtSnapshots: BuiltSnapshot[] = []
	for (const [selection, dailyCountRows] of rowsBySelection) {
		// count the items, failing the build if Redis fails
		const countedItems = await toCountedItems({ dailyCountRows, isDailyPlayCount })
		if (!countedItems) {
			throw new Error(`the ${subject.dashboardKind} ${subject.subjectId} sketch count failed`)
		}
		builtSnapshots.push(...toSeriesSnapshots({ selection, countedItems, lastDay }))
	}

	// the summary counts every selection's rows once: every view kind, or the plays of both formats
	const summaryRows = isDailyPlayCount ? (rowsBySelection.get("both") ?? []) : [...rowsBySelection.values()].flat()
	const summaries = await loadDashboardSummaries(subject, summaryRows)
	if (!summaries) {
		throw new Error(`the ${subject.dashboardKind} ${subject.subjectId} viewer count failed`)
	}
	builtSnapshots.push(
		...toLevelSnapshots({ selection: "summary", publicBody: summaries.public, fullBody: summaries.full }),
	)
	return writeDashboardSnapshots({ subject, lastDay, builtSnapshots, snapshotGeneration })
}

// one selection's counted items and the last completed day
type ToSeriesSnapshotsOptions = { selection: DashboardSelection; countedItems: CountedItem[]; lastDay: string }

// one selection's series for the public items and, if any item is private, for every item
function toSeriesSnapshots({ selection, countedItems, lastDay }: ToSeriesSnapshotsOptions): BuiltSnapshot[] {
	// the series of the items shown at one level
	const toSeries = (shownItems: CountedItem[]): ReturnType<typeof toDashboardSeries> =>
		toDashboardSeries({
			itemCounts: shownItems.map(({ itemCounts }) => itemCounts),
			isFindingSelection: selection === "finding",
			lastCompletedDay: lastDay,
		})

	// the public items, and every item if any is private
	const publicBody = toSeries(countedItems.filter(({ isPublic }) => isPublic))
	const fullBody = countedItems.every(({ isPublic }) => isPublic) ? publicBody : toSeries(countedItems)
	return toLevelSnapshots({ selection, publicBody, fullBody })
}

// a selection and its public and full bodies
type ToLevelSnapshotsOptions = { selection: DashboardSelection; publicBody: unknown; fullBody: unknown }

// the public snapshot, and the full snapshot if its body differs from the public one
function toLevelSnapshots({ selection, publicBody, fullBody }: ToLevelSnapshotsOptions): BuiltSnapshot[] {
	const publicSnapshot: BuiltSnapshot = { selection, accessLevel: "public", body: publicBody }
	if (JSON.stringify(fullBody) === JSON.stringify(publicBody)) {
		return [publicSnapshot]
	}
	return [publicSnapshot, { selection, accessLevel: "full", body: fullBody }]
}

// the subject, the last completed day, the snapshots to write, and the snapshot generation the daily counts loaded in
type WriteDashboardSnapshotsOptions = {
	subject: DashboardSubject
	lastDay: string
	builtSnapshots: BuiltSnapshot[]
	snapshotGeneration: string | null
}

// write the changed snapshots in one transaction, move the unchanged ones to the last day, delete the subject's
// snapshots that are no longer built, and return the access levels whose summary hash changed
async function writeDashboardSnapshots({
	subject,
	lastDay,
	builtSnapshots,
	snapshotGeneration,
}: WriteDashboardSnapshotsOptions): Promise<DashboardAccessLevel[]> {
	return db.transaction(async (transaction) => {
		// write nothing if a delete started a new generation after the daily counts loaded. a generation Redis could not read
		// leaves the write unchecked
		const currentGeneration = await readDashboardSnapshotGeneration(subject)
		if (snapshotGeneration !== null && currentGeneration !== null && currentGeneration !== snapshotGeneration) {
			return []
		}

		// sort the built snapshots against the subject's saved snapshots
		const savedSnapshots = await transaction
			.select({
				id: dashboardSnapshots.id,
				selection: dashboardSnapshots.selection,
				accessLevel: dashboardSnapshots.accessLevel,
				contentHash: dashboardSnapshots.contentHash,
				day: dashboardSnapshots.day,
			})
			.from(dashboardSnapshots)
			.where(toDashboardSnapshotFilter(subject))
		const { changedSnapshots, movedSnapshotIds, staleSnapshotIds } = toSnapshotChanges({
			builtSnapshots,
			savedSnapshots,
			lastDay,
		})

		// write each changed snapshot over the saved one. an unchanged snapshot keeps its body, paragraph, and share image
		for (const { selection, accessLevel, body, contentHash } of changedSnapshots) {
			await transaction
				.insert(dashboardSnapshots)
				.values({ ...subject, selection, accessLevel, day: lastDay, body, contentHash })
				.onConflictDoUpdate({
					target: [
						dashboardSnapshots.dashboardKind,
						dashboardSnapshots.subjectId,
						dashboardSnapshots.selection,
						dashboardSnapshots.accessLevel,
					],
					set: { day: lastDay, body, contentHash },
				})
		}

		// move the unchanged snapshots to the last day
		if (movedSnapshotIds.length > 0) {
			await transaction
				.update(dashboardSnapshots)
				.set({ day: lastDay })
				.where(inArray(dashboardSnapshots.id, movedSnapshotIds))
		}

		// delete what is no longer built, such as a full snapshot if every item is public
		if (staleSnapshotIds.length > 0) {
			await transaction.delete(dashboardSnapshots).where(inArray(dashboardSnapshots.id, staleSnapshotIds))
		}

		// return the access levels whose summary changed
		return changedSnapshots.filter(({ selection }) => selection === "summary").map(({ accessLevel }) => accessLevel)
	})
}

// a saved snapshot's id, selection, access level, hash, and day
type SavedSnapshot = Pick<
	typeof dashboardSnapshots.$inferSelect,
	"id" | "selection" | "accessLevel" | "contentHash" | "day"
>

// the built snapshots, the subject's saved snapshots, and the last completed day
type ToSnapshotChangesOptions = { builtSnapshots: BuiltSnapshot[]; savedSnapshots: SavedSnapshot[]; lastDay: string }

// the built snapshots whose body changed with their new hash, the unchanged snapshots that count an earlier day, and
// the saved snapshots the build left out
type SnapshotChanges = {
	changedSnapshots: (BuiltSnapshot & { contentHash: string })[]
	movedSnapshotIds: string[]
	staleSnapshotIds: string[]
}

// sort the built snapshots by whether their hash matches the saved snapshot of the same selection and access level
function toSnapshotChanges({ builtSnapshots, savedSnapshots, lastDay }: ToSnapshotChangesOptions): SnapshotChanges {
	const savedSnapshotByKey = new Map(
		savedSnapshots.map((savedSnapshot) => [toSnapshotKey(savedSnapshot), savedSnapshot]),
	)
	const snapshotChanges: SnapshotChanges = { changedSnapshots: [], movedSnapshotIds: [], staleSnapshotIds: [] }
	for (const builtSnapshot of builtSnapshots) {
		// the built snapshot's hash, and the saved snapshot of its selection and access level
		const contentHash = new Bun.CryptoHasher("sha256").update(JSON.stringify(builtSnapshot.body)).digest("hex")
		const snapshotKey = toSnapshotKey(builtSnapshot)
		const savedSnapshot = savedSnapshotByKey.get(snapshotKey)
		savedSnapshotByKey.delete(snapshotKey)

		// a changed snapshot is written, and an unchanged one moves to the last day if it counts an earlier one
		if (savedSnapshot?.contentHash !== contentHash) {
			snapshotChanges.changedSnapshots.push({ ...builtSnapshot, contentHash })
		} else if (savedSnapshot.day !== lastDay) {
			snapshotChanges.movedSnapshotIds.push(savedSnapshot.id)
		}
	}

	// every saved snapshot left is no longer built
	snapshotChanges.staleSnapshotIds = [...savedSnapshotByKey.values()].map(({ id }) => id)
	return snapshotChanges
}

// a snapshot's selection and access level as one key
function toSnapshotKey({ selection, accessLevel }: { selection: string; accessLevel: string }): string {
	return `${selection}:${accessLevel}`
}
