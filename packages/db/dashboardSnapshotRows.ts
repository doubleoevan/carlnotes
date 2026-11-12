// the filters and the fallback for reading a Dashboard's snapshot rows, the delete of whole Dashboards' snapshots, the
// subjects of a person's Dashboards, and the snapshot generation that keeps a build that loaded before a delete from
// writing after it. a snapshot's subject is a person's or a team's id with no foreign key, and nothing cascades to it
import {
	type DashboardAccessLevel,
	type DashboardSubject,
	PERSONAL_DASHBOARD_KINDS,
} from "@carlnotes/contracts/dashboards"
import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import type { DbHandle } from "./index"
import { runWithRedis } from "./redis"
import { dashboardSnapshots } from "./schema/dashboards"
import { recordPendingObjectDeletions, toStoredObjectKeys } from "./store"

// a snapshot row's selection and access level, which a read picks its rows by
type DashboardSnapshotRowKey = { selection: string; accessLevel: DashboardAccessLevel }

// how long a snapshot generation lasts after the delete that started it, far longer than any build
const SNAPSHOT_GENERATION_SECONDS = 2 * 24 * 60 * 60

/**
 * Returns the filter for one Dashboard's snapshot rows.
 */
export function toDashboardSnapshotFilter({ dashboardKind, subjectId }: DashboardSubject): SQL {
	return and(eq(dashboardSnapshots.dashboardKind, dashboardKind), eq(dashboardSnapshots.subjectId, subjectId)) as SQL
}

/**
 * Returns the filter for a Dashboard's summary row at one access level.
 */
export function toDashboardSummaryRowFilter(subject: DashboardSubject, accessLevel: DashboardAccessLevel): SQL {
	return and(
		toDashboardSnapshotFilter(subject),
		eq(dashboardSnapshots.selection, "summary"),
		eq(dashboardSnapshots.accessLevel, accessLevel),
	) as SQL
}

/**
 * Returns the filter for a Dashboard's rows of the selections that a read at an access level needs: the public rows
 * for a public read, and the full rows with the public rows for a full read.
 */
export function toDashboardReadFilter(
	subject: DashboardSubject,
	selections: string[],
	accessLevel: DashboardAccessLevel,
): SQL {
	return and(
		toDashboardSnapshotFilter(subject),
		inArray(dashboardSnapshots.selection, selections),
		inArray(dashboardSnapshots.accessLevel, accessLevel === "full" ? ["full", "public"] : ["public"]),
	) as SQL
}

/**
 * Returns a selection's row at an access level from a read's rows, or its public row if the build left the full row
 * out because it matched the public one.
 */
export function pickDashboardSnapshotRow<Row extends DashboardSnapshotRowKey>(
	rows: Row[],
	selection: string,
	accessLevel: DashboardAccessLevel,
): Row | undefined {
	return (
		rows.find((row) => row.selection === selection && row.accessLevel === accessLevel) ??
		rows.find((row) => row.selection === selection && row.accessLevel === "public")
	)
}

/**
 * Starts a new snapshot generation for each Dashboard, deletes every snapshot of the Dashboards, records their share
 * images' object keys as pending on the handle, and returns the keys.
 */
export async function deleteDashboardSnapshotRows(handle: DbHandle, subjects: DashboardSubject[]): Promise<string[]> {
	if (subjects.length === 0) {
		return []
	}

	// the new generations first, so a build that loaded its daily counts before the delete skips its write
	await Promise.all(subjects.map(startDashboardSnapshotGeneration))

	// delete each Dashboard's snapshots, returning their share images' keys
	const deletedRows = await handle
		.delete(dashboardSnapshots)
		.where(or(...subjects.map(toDashboardSnapshotFilter)))
		.returning({ objectKey: dashboardSnapshots.imageKey })

	// record the keys as pending
	const imageKeys = toStoredObjectKeys(deletedRows)
	await recordPendingObjectDeletions({ handle, objectKeys: imageKeys })
	return imageKeys
}

/**
 * Returns a person's own Dashboards, their Topic and Podcast Dashboards.
 */
export function toPersonalDashboardSubjects(userId: string): DashboardSubject[] {
	return PERSONAL_DASHBOARD_KINDS.map((dashboardKind) => ({ dashboardKind, subjectId: userId }))
}

/**
 * Returns each Dashboard once, in the order the subjects first name it.
 */
export function toUniqueDashboardSubjects(subjects: DashboardSubject[]): DashboardSubject[] {
	const subjectByKey = new Map(subjects.map((subject) => [`${subject.dashboardKind}:${subject.subjectId}`, subject]))
	return [...subjectByKey.values()]
}

/**
 * Returns a Dashboard's snapshot generation, an empty string before its first delete, or null if Redis could not read
 * it. A build writes only if the generation it read before loading its daily counts is still the current one.
 */
export async function readDashboardSnapshotGeneration(subject: DashboardSubject): Promise<string | null> {
	return runWithRedis(
		"readDashboardSnapshotGeneration",
		async (client) => (await client.get(toSnapshotGenerationKey(subject))) ?? "",
	)
}

// start a new snapshot generation for a Dashboard. a generation Redis could not start leaves a running build's write
// unchecked
async function startDashboardSnapshotGeneration(subject: DashboardSubject): Promise<void> {
	await runWithRedis("startDashboardSnapshotGeneration", (client) =>
		client.set(toSnapshotGenerationKey(subject), crypto.randomUUID(), "EX", String(SNAPSHOT_GENERATION_SECONDS)),
	)
}

// the key of a Dashboard's snapshot generation
function toSnapshotGenerationKey({ dashboardKind, subjectId }: DashboardSubject): string {
	return `dashboard-snapshot-generation:${dashboardKind}:${subjectId}`
}
