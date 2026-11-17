// the nightly Dashboard build's activities: list the Dashboards with daily count rows in the window, build a batch of
// their snapshots and purge their edge cache tags, write Carl's paragraphs, draw the share images, and delete daily
// count rows past the retention
import { toChunks } from "@carlnotes/contracts/arrays"
import {
	DAILY_COUNT_RETENTION_DAYS,
	DASHBOARD_WINDOW_DAYS,
	type DashboardAccessLevel,
	type DashboardSeries,
	type DashboardSubject,
	type DashboardSummary,
	toDefaultDashboardSelection,
} from "@carlnotes/contracts/dashboards"
import { db } from "@carlnotes/db"
import { pickDashboardSnapshotRow, toDashboardReadFilter } from "@carlnotes/db/dashboardSnapshotRows"
import { dailyPlayCounts, dailyViewCounts } from "@carlnotes/db/schema/dailyCounts"
import { dashboardSnapshots } from "@carlnotes/db/schema/dashboards"
import {
	clearPendingObjectDeletion,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toDashboardShareImageKey,
	toStoredObjectKeys,
	uploadAttachment,
} from "@carlnotes/db/store"
import {
	type DashboardParagraphInput,
	takeDashboardParagraphAllowance,
	writeDashboardParagraph,
} from "@carlnotes/pipeline/dashboardParagraph"
import { toDashboardShareImagePng } from "@carlnotes/pipeline/dashboardShareImage"
import { purgeEdgeCacheTags, toDashboardCacheTag } from "@carlnotes/server/edgePurge"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, lt, type SQL } from "drizzle-orm"
import { toRangeFirstDay } from "../dashboards/dashboardSeries"
import { buildDashboardSnapshots } from "../dashboards/dashboardSnapshots"
import { listDashboardSubjects } from "../dashboards/dashboardSubjects"

// the most tags one Cloudflare purge request takes
const PURGE_TAG_LIMIT = 30

// one Dashboard whose summary changed or needs a paragraph at an access level
export type ChangedDashboardSummary = DashboardSubject & { accessLevel: DashboardAccessLevel }

// identify the snapshot whose data was read before starting a paragraph or image
type DashboardSnapshotVersion = Pick<typeof dashboardSnapshots.$inferSelect, "id" | "contentHash">

/**
 * Lists the Dashboards with a daily count row in the window ending on the last completed day.
 */
export function listDashboardSubjectsActivity(lastDay: string): Promise<DashboardSubject[]> {
	const firstDay = toRangeFirstDay(lastDay, DASHBOARD_WINDOW_DAYS)
	return listDashboardSubjects(firstDay)
}

// a batch of Dashboards and the last completed day
type BuildDashboardSnapshotsActivityInput = { subjects: DashboardSubject[]; lastDay: string }

/**
 * Builds a batch of Dashboards' snapshots, purges their edge cache tags, and returns the summaries to refresh. A
 * Dashboard whose build fails is reported and skipped. A batch where every build fails throws an error.
 */
export async function buildDashboardSnapshotsActivity({
	subjects,
	lastDay,
}: BuildDashboardSnapshotsActivityInput): Promise<ChangedDashboardSummary[]> {
	// build each Dashboard in turn, and keep going past a failed one
	const changedSummaries: ChangedDashboardSummary[] = []
	const buildErrors: unknown[] = []
	for (const subject of subjects) {
		try {
			const changedLevels = await buildDashboardSnapshots(subject, lastDay)
			changedSummaries.push(...changedLevels.map((accessLevel) => ({ ...subject, accessLevel })))
		} catch (error) {
			// report the failure and keep its error
			reportError(error, "dashboard", subject)
			buildErrors.push(error)
		}
	}

	// throw the first error if every build failed
	if (buildErrors.length > 0 && buildErrors.length === subjects.length) {
		throw buildErrors[0]
	}

	// purge the batch's edge cache tags, then return the changed summaries
	await purgeDashboardCacheTags(subjects)
	return changedSummaries
}

// a batch of changed summaries and the last completed day
type WriteDashboardParagraphsActivityInput = { changedSummaries: ChangedDashboardSummary[]; lastDay: string }

/**
 * Writes Carl's paragraph for each eligible summary within its Dashboard's allowance for the day, until the platform's
 * allowance is spent. A summary past either allowance, or whose paragraph fails, keeps its last paragraph. Returns how
 * many were written.
 */
export async function writeDashboardParagraphsActivity({
	changedSummaries,
	lastDay,
}: WriteDashboardParagraphsActivityInput): Promise<number> {
	let writtenCount = 0
	const writtenPublicSummaries: DashboardSubject[] = []
	for (const changedSummary of changedSummaries) {
		// skip a Dashboard past its own allowance, and stop once the platform's is spent
		const paragraphAllowance = await takeDashboardParagraphAllowance(lastDay, changedSummary)
		if (paragraphAllowance === "platformLimitReached") {
			break
		}
		if (paragraphAllowance === "dashboardLimitReached") {
			continue
		}

		// write the paragraph from the summary and its page's default selection, and keep the last one on a failure
		try {
			const paragraphInput = await loadDashboardParagraphInput(changedSummary)
			if (!paragraphInput) {
				continue
			}

			// keep an in-flight paragraph from reaching a replacement snapshot
			const paragraph = await writeDashboardParagraph(paragraphInput)
			const writtenSummaries = await db
				.update(dashboardSnapshots)
				.set({ paragraph })
				.where(toDashboardSnapshotVersionFilter(paragraphInput.snapshotVersion))
				.returning({ id: dashboardSnapshots.id })
			writtenCount += writtenSummaries.length
			if (writtenSummaries.length > 0 && changedSummary.accessLevel === "public") {
				writtenPublicSummaries.push(changedSummary)
			}
		} catch (error) {
			// report the failed paragraph
			reportError(error, "dashboard", changedSummary)
		}
	}

	// the edge can cache a read between the snapshot build and the paragraph write
	await purgeDashboardCacheTags(writtenPublicSummaries)
	return writtenCount
}

/**
 * Draws the share image of each Dashboard whose public summary changed, from the public bars of its page's default
 * selection, and saves its key on the summary. The old image's key is recorded for deletion. A failed image is
 * reported, and the summary keeps its last one.
 */
export async function drawDashboardShareImagesActivity(changedSummaries: ChangedDashboardSummary[]): Promise<void> {
	// draw each public summary's image, and report a failed one
	for (const changedSummary of changedSummaries.filter(({ accessLevel }) => accessLevel === "public")) {
		try {
			await drawDashboardShareImage(changedSummary)
		} catch (error) {
			reportError(error, "dashboard", changedSummary)
		}
	}
}

/**
 * Deletes the daily view and play count rows older than the retention, counted back from the last completed day.
 */
export async function deleteExpiredDailyCountsActivity(lastDay: string): Promise<void> {
	const firstKeptDay = toRangeFirstDay(lastDay, DAILY_COUNT_RETENTION_DAYS)
	await db.delete(dailyViewCounts).where(lt(dailyViewCounts.day, firstKeptDay))
	await db.delete(dailyPlayCounts).where(lt(dailyPlayCounts.day, firstKeptDay))
}

// purge the Dashboards' public snapshots from the edge, a request per 30 tags, and report a failed purge
async function purgeDashboardCacheTags(subjects: DashboardSubject[]): Promise<void> {
	const tags = subjects.map(toDashboardCacheTag)
	for (const tagChunk of toChunks(tags, PURGE_TAG_LIMIT)) {
		// send one purge, and report a failure without failing the build
		const edgePurgeResult = await purgeEdgeCacheTags({
			tags: tagChunk,
			zoneId: Bun.env.CLOUDFLARE_ZONE_ID,
			apiToken: Bun.env.CLOUDFLARE_API_TOKEN,
		})
		if (edgePurgeResult.status === "failed") {
			reportError(new Error(`the dashboard edge purge failed: ${edgePurgeResult.reason}`), "dashboard")
		}
	}
}

// draw a public summary's share image and attach it to that snapshot version
async function drawDashboardShareImage(subject: DashboardSubject): Promise<void> {
	const { dashboardKind } = subject

	// the public summary and the default selection's public bars
	const publicSnapshotRows = await db
		.select({
			id: dashboardSnapshots.id,
			selection: dashboardSnapshots.selection,
			body: dashboardSnapshots.body,
			contentHash: dashboardSnapshots.contentHash,
			imageKey: dashboardSnapshots.imageKey,
		})
		.from(dashboardSnapshots)
		.where(toDashboardReadFilter(subject, ["summary", toDefaultDashboardSelection(dashboardKind)], "public"))
	const summaryRow = publicSnapshotRows.find(({ selection }) => selection === "summary")
	const seriesRow = publicSnapshotRows.find(({ selection }) => selection !== "summary")
	if (!summaryRow) {
		return
	}

	// include the snapshot id so an upload from before an access change cannot overwrite its replacement's image
	const bars = (seriesRow?.body as DashboardSeries | undefined)?.bars ?? []
	const imageVersion = `${summaryRow.id}-${summaryRow.contentHash}`
	const imageKey = bars.length > 0 ? toDashboardShareImageKey(subject, imageVersion) : null
	if (imageKey === summaryRow.imageKey) {
		return
	}

	// upload the png, recorded first so an upload whose row never saves is deleted after the grace period
	const imagePng = await toDashboardShareImagePng({ dashboardKind, bars })
	if (imageKey && imagePng) {
		await recordPendingObjectDeletionBeforeUpload(imageKey)
		await uploadAttachment(imageKey, imagePng, "image/png")
	}

	// attach only to the snapshot that supplied the image and let a stale upload expire
	await db.transaction(async (transaction) => {
		const updatedSnapshots = await transaction
			.update(dashboardSnapshots)
			.set({ imageKey })
			.where(toDashboardSnapshotVersionFilter(summaryRow))
			.returning({ id: dashboardSnapshots.id })
		if (updatedSnapshots.length === 0) {
			return
		}

		// retain the attached image and queue the previous one for deletion
		if (imageKey) {
			await clearPendingObjectDeletion(imageKey, transaction)
		}
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toStoredObjectKeys([{ objectKey: summaryRow.imageKey }]),
		})
	})
}

// a summary's snapshot and the series of its page's default selection at its level, or the public series if the full
// one is the same and was not written. null if the summary is gone
async function loadDashboardParagraphInput(
	changedSummary: ChangedDashboardSummary,
): Promise<(DashboardParagraphInput & { snapshotVersion: DashboardSnapshotVersion }) | null> {
	// the summary and the default selection's snapshots at the summary's level and the public one
	const { accessLevel } = changedSummary
	const defaultSelection = toDefaultDashboardSelection(changedSummary.dashboardKind)
	const snapshotRows = await db
		.select({
			id: dashboardSnapshots.id,
			contentHash: dashboardSnapshots.contentHash,
			selection: dashboardSnapshots.selection,
			accessLevel: dashboardSnapshots.accessLevel,
			body: dashboardSnapshots.body,
		})
		.from(dashboardSnapshots)
		.where(toDashboardReadFilter(changedSummary, ["summary", defaultSelection], accessLevel))

	// the summary at its access level, or nothing to write about if the build left it out
	const summaryRow = snapshotRows.find(
		(snapshotRow) => snapshotRow.selection === "summary" && snapshotRow.accessLevel === accessLevel,
	)
	if (!summaryRow) {
		return null
	}

	// the series at the summary's level, or the public one if the full one matched it and was not written
	const seriesRow = pickDashboardSnapshotRow(snapshotRows, defaultSelection, accessLevel)
	return {
		snapshotVersion: { id: summaryRow.id, contentHash: summaryRow.contentHash },
		summary: summaryRow.body as DashboardSummary,
		series: (seriesRow?.body as DashboardSeries | undefined) ?? null,
	}
}

// match the row and its content as read before starting the paragraph or image
function toDashboardSnapshotVersionFilter({ id, contentHash }: DashboardSnapshotVersion): SQL {
	return and(eq(dashboardSnapshots.id, id), eq(dashboardSnapshots.contentHash, contentHash)) as SQL
}
