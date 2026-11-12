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
import {
	pickDashboardSnapshotRow,
	toDashboardReadFilter,
	toDashboardSummaryRowFilter,
} from "@carlnotes/db/dashboardSnapshotRows"
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
import { lt } from "drizzle-orm"
import { toRangeFirstDay } from "../dashboards/dashboardSeries"
import { buildDashboardSnapshots } from "../dashboards/dashboardSnapshots"
import { listDashboardSubjects } from "../dashboards/dashboardSubjects"

// the most tags one Cloudflare purge request takes
const PURGE_TAG_LIMIT = 30

// one Dashboard whose summary changed at an access level
export type ChangedDashboardSummary = DashboardSubject & { accessLevel: DashboardAccessLevel }

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
 * Builds a batch of Dashboards' snapshots, purges their edge cache tags, and returns the summaries that changed. A
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
 * Writes Carl's paragraph for each changed summary within its Dashboard's allowance for the day, until the platform's
 * allowance is spent. A summary past either allowance, or whose paragraph fails, keeps its last paragraph. Returns how
 * many were written.
 */
export async function writeDashboardParagraphsActivity({
	changedSummaries,
	lastDay,
}: WriteDashboardParagraphsActivityInput): Promise<number> {
	let writtenCount = 0
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

			// save the paragraph on the summary at its access level
			const paragraph = await writeDashboardParagraph(paragraphInput)
			await db
				.update(dashboardSnapshots)
				.set({ paragraph })
				.where(toDashboardSummaryRowFilter(changedSummary, changedSummary.accessLevel))
			writtenCount += 1
		} catch (error) {
			// report the failed paragraph
			reportError(error, "dashboard", changedSummary)
		}
	}
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

// draw one public summary's share image, upload it under its summary's hash, and swap it onto the summary
async function drawDashboardShareImage(subject: DashboardSubject): Promise<void> {
	const { dashboardKind } = subject

	// the public summary's hash and image, and the default selection's public bars
	const publicSnapshotRows = await db
		.select({
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

	// the image under the summary's hash, or none for a Dashboard with no public bars.
	// ponytail: named by the summary's hash, so bars that move under an unchanged summary keep the last image
	const bars = (seriesRow?.body as DashboardSeries | undefined)?.bars ?? []
	const imageKey = bars.length > 0 ? toDashboardShareImageKey(subject, summaryRow.contentHash) : null
	if (imageKey === summaryRow.imageKey) {
		return
	}

	// upload the png, recorded first so an upload whose row never saves is deleted after the grace period
	const imagePng = await toDashboardShareImagePng({ dashboardKind, bars })
	if (imageKey && imagePng) {
		await recordPendingObjectDeletionBeforeUpload(imageKey)
		await uploadAttachment(imageKey, imagePng, "image/png")
	}

	// save the new key and record the old one, in one transaction
	await db.transaction(async (transaction) => {
		await transaction.update(dashboardSnapshots).set({ imageKey }).where(toDashboardSummaryRowFilter(subject, "public"))
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
): Promise<DashboardParagraphInput | null> {
	// the summary and the default selection's snapshots at the summary's level and the public one
	const { accessLevel } = changedSummary
	const defaultSelection = toDefaultDashboardSelection(changedSummary.dashboardKind)
	const snapshotRows = await db
		.select({
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
		summary: summaryRow.body as DashboardSummary,
		series: (seriesRow?.body as DashboardSeries | undefined) ?? null,
	}
}
