// the sweep's retries of the pending object deletions

import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { pendingObjectDeletions } from "@carlnotes/db/schema/storage"
import { deleteStoredObject } from "@carlnotes/db/store"
import { reportError } from "@carlnotes/server/monitoring"
import { asc, eq, lte } from "drizzle-orm"

// how many pending keys one run retries, and how long a key may stay pending before it is reported once
const RETRY_BATCH_SIZE = 200
const REPORT_AFTER_MS = DAY_MS

// what one run did
export type PendingObjectDeletionRetrySummary = { deletedCount: number; failedCount: number }

/**
 * Retries the pending object deletions whose try time has passed, oldest first, up to one run's batch,
 * and reports a key that has been pending for over a day once, on the retry that fails.
 */
export async function retryPendingObjectDeletions(): Promise<PendingObjectDeletionRetrySummary> {
	// read the oldest batch of keys whose try time has passed
	const now = new Date()
	const pendingObjectDeletionRows = await db
		.select({
			objectKey: pendingObjectDeletions.objectKey,
			recordedAt: pendingObjectDeletions.recordedAt,
			attemptCount: pendingObjectDeletions.attemptCount,
			reportedAt: pendingObjectDeletions.reportedAt,
		})
		.from(pendingObjectDeletions)
		.where(lte(pendingObjectDeletions.nextTryAt, now))
		.orderBy(asc(pendingObjectDeletions.recordedAt))
		.limit(RETRY_BATCH_SIZE)

	// delete each one, and report a stale key that failed again
	const pendingObjectDeletionRetrySummary = { deletedCount: 0, failedCount: 0 }
	for (const pendingObjectDeletionRow of pendingObjectDeletionRows) {
		// count a success
		if (await deleteStoredObject(pendingObjectDeletionRow.objectKey)) {
			pendingObjectDeletionRetrySummary.deletedCount += 1
			continue
		}

		// count a failure, and report the key if it has been pending for over a day
		pendingObjectDeletionRetrySummary.failedCount += 1
		await reportStalePendingObjectDeletion(pendingObjectDeletionRow, now)
	}

	// log a run that had something to do
	if (pendingObjectDeletionRows.length > 0) {
		console.log(
			`pending object deletions: ${pendingObjectDeletionRetrySummary.deletedCount} deleted, ${pendingObjectDeletionRetrySummary.failedCount} failed, ${pendingObjectDeletionRows.length} tried`,
		)
	}
	return pendingObjectDeletionRetrySummary
}

// one pending key as the retry reads it
type PendingObjectDeletionRow = Pick<
	typeof pendingObjectDeletions.$inferSelect,
	"objectKey" | "recordedAt" | "attemptCount" | "reportedAt"
>

// report a key pending for over a day once, and mark it reported
async function reportStalePendingObjectDeletion(
	pendingObjectDeletionRow: PendingObjectDeletionRow,
	now: Date,
): Promise<void> {
	// skip a key that is not a day old yet, or that was reported already
	if (
		pendingObjectDeletionRow.reportedAt ||
		now.getTime() - pendingObjectDeletionRow.recordedAt.getTime() < REPORT_AFTER_MS
	) {
		return
	}

	// report the key with its failed attempts, then mark it reported
	reportError(new Error("a stored object has been pending deletion for over a day"), "object-storage", {
		objectKey: pendingObjectDeletionRow.objectKey,
		attemptCount: String(pendingObjectDeletionRow.attemptCount + 1),
	})
	await db
		.update(pendingObjectDeletions)
		.set({ reportedAt: now })
		.where(eq(pendingObjectDeletions.objectKey, pendingObjectDeletionRow.objectKey))
}
