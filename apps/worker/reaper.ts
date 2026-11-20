// the sweep's reaper: how it reaps one kind of row left in progress past its workflow's longest run. past the limit it
// asks Temporal whether the row's workflow still runs. a workflow that is gone has its work started again once on the
// same row, and a row that was already started again is failed. a workflow that still runs is left and reported, and a
// day past the limit it is terminated and its row failed. the kinds of row are in reapedKinds.ts

import { DAY_MS } from "@carlnotes/contracts/time"
import { isWorkflowRunning, terminateWorkflow } from "@carlnotes/pipeline/temporalClient"
import { type ReportedStage, reportError } from "@carlnotes/server/monitoring"
import { type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

// how many rows of one kind one sweep reaps, oldest first. each costs a Temporal read, so the rest wait for the next
// sweep
export const REAP_BATCH_SIZE = 100

// how long past its limit a row's workflow may still run before the reaper terminates it and fails the row
const TERMINATE_AFTER_MS = DAY_MS

// why the reaper failed a row: its workflow was gone twice, no workflow could be started for it, or its workflow ran a
// day past the limit. a person may read the reason, so it says what happened in plain words
export const REAPED_REASON = "the work stopped and did not finish after it was started again"
export const NOT_RESTARTABLE_REASON = "the work stopped and could not be started again"
export const TERMINATED_REASON = "the work ran a day past its limit and was stopped"

// whether a row's work can be started again: it can, the reaper already started it again once, or nothing can start it
export type RestartState = "available" | "used" | "unavailable"

// a row past its limit: its id, the id of the workflow that does its work, or null if none can be derived, when its
// work last began, and whether its work can be started again
export type StaleRow = { id: string; workflowId: string | null; startedAt: Date; restartState: RestartState }

// one kind of row that the reaper reaps: its name in logs and reports with the stage its reports are filed under, how
// long a row may stay in progress, the read of the rows whose work began before a time, the restart of a row's work
// that also records the restart on the row, and the write that fails a row for good
export type ReapedKind<Row extends StaleRow> = {
	name: string
	stage: ReportedStage
	limitMs: number
	loadStaleRows: (startedBefore: Date) => Promise<Row[]>
	restartWork: (staleRow: Row) => Promise<void>
	failRow: (staleRow: Row, reason: string) => Promise<void>
}

// what the reaper did with one kind of row: how many it started again, failed for good, left because the workflow
// still runs, terminated a day past the limit, and left unread because Temporal could not be read
export type ReapSummary = { restarted: number; failed: number; running: number; terminated: number; unread: number }

// the kind to reap, the time of the sweep, and the signal that the sweep's lease aborts
type ReapStaleRowsOptions<Row extends StaleRow> = { reapedKind: ReapedKind<Row>; now?: Date; signal?: AbortSignal }

/**
 * Reaps one kind's rows that are still in progress past their limit, oldest first, and returns what it did. A row
 * whose workflow still runs is left, and reported once for the kind. A failed Temporal read leaves that row and every
 * row after it for the next sweep, so an unreachable server never starts or fails anything.
 */
export async function reapStaleRows<Row extends StaleRow>({
	reapedKind,
	now = new Date(),
	signal,
}: ReapStaleRowsOptions<Row>): Promise<ReapSummary> {
	// the rows whose work began before the limit
	const reapSummary: ReapSummary = { restarted: 0, failed: 0, running: 0, terminated: 0, unread: 0 }
	const staleRows = await reapedKind.loadStaleRows(new Date(now.getTime() - reapedKind.limitMs))

	// reap each row, stopping once Temporal cannot be read or the sweep's lease is lost
	for (const [i, staleRow] of staleRows.entries()) {
		signal?.throwIfAborted()
		const rowOutcome = await reapStaleRow({ reapedKind, staleRow, now })

		// an unread row leaves itself and every row after it for the next sweep
		if (rowOutcome === "unread") {
			reapSummary.unread = staleRows.length - i
			break
		}
		reapSummary[rowOutcome]++
	}

	// report the workflows that still run past their limit, which is what a queue that is backed up for hours looks like
	if (reapSummary.running > 0) {
		reportError(new Error(`a ${reapedKind.name}'s workflow still runs past its limit`), reapedKind.stage, {
			rowCount: String(reapSummary.running),
		})
	}
	return reapSummary
}

// one row to reap, with its kind and the time of the sweep
type ReapStaleRowOptions<Row extends StaleRow> = { reapedKind: ReapedKind<Row>; staleRow: Row; now: Date }

// reap one row and return what was done with it. a failure of the restart or of the failing write is reported, and
// leaves the row for the next sweep as an unread row does
async function reapStaleRow<Row extends StaleRow>({
	reapedKind,
	staleRow,
	now,
}: ReapStaleRowOptions<Row>): Promise<keyof ReapSummary> {
	try {
		// a row with no workflow to ask about or to start is failed
		if (staleRow.workflowId === null) {
			await reapedKind.failRow(staleRow, NOT_RESTARTABLE_REASON)
			return "failed"
		}

		// a workflow that still runs is healthy work on a backed-up queue until a day past the limit, where it is stopped
		// so it spends no more on a row that can no longer finish
		if (await isWorkflowRunning(staleRow.workflowId)) {
			const terminateBefore = now.getTime() - reapedKind.limitMs - TERMINATE_AFTER_MS
			if (staleRow.startedAt.getTime() >= terminateBefore) {
				return "running"
			}

			// terminate first, so the workflow cannot write to the row after it is failed
			await terminateWorkflow(staleRow.workflowId, TERMINATED_REASON)
			await reapedKind.failRow(staleRow, TERMINATED_REASON)
			return "terminated"
		}

		// a workflow that is gone has its work started again once. a row that used its restart, and a row that nothing
		// can start, is failed
		if (staleRow.restartState !== "available") {
			const reason = staleRow.restartState === "used" ? REAPED_REASON : NOT_RESTARTABLE_REASON
			await reapedKind.failRow(staleRow, reason)
			return "failed"
		}
		await reapedKind.restartWork(staleRow)
		return "restarted"
	} catch (error) {
		// a failed Temporal read, restart, or failing write changes nothing more this sweep
		console.error(`could not reap ${reapedKind.name} ${staleRow.id}`, error)
		reportError(error, reapedKind.stage, { reapedKind: reapedKind.name, rowId: staleRow.id })
		return "unread"
	}
}

/**
 * Returns the filter that matches a row whose work last began before a time: its restart if the reaper started it
 * again, and its creation otherwise. The creation is compared by itself too, which lets an index led by it serve the
 * read.
 */
export function toStartedBeforeFilter(restartedAt: PgColumn, createdAt: PgColumn, startedBefore: Date): SQL {
	const startedBeforeText = startedBefore.toISOString()
	return sql`${createdAt} < ${startedBeforeText}::timestamptz and coalesce(${restartedAt}, ${createdAt}) < ${startedBeforeText}::timestamptz`
}

/**
 * Returns whether a row's work can be started again, from when the reaper last started it again and whether what the
 * work reads is still there.
 */
export function toRestartState(restartedAt: Date | null, isStartable: boolean): RestartState {
	if (!isStartable) {
		return "unavailable"
	}
	return restartedAt === null ? "available" : "used"
}

// a row whose limit runs from its creation: its id, its workflow's id, when it was written, and when the reaper
// started it again, or null
type CreatedRow = { id: string; workflowId: string; createdAt: Date; restartedAt: Date | null }

/**
 * Returns the stale row of a row whose work can always be started again. Its work last began at its restart, or else
 * at its creation.
 */
export function toCreatedStaleRow({ id, workflowId, createdAt, restartedAt }: CreatedRow): StaleRow {
	return { id, workflowId, startedAt: restartedAt ?? createdAt, restartState: toRestartState(restartedAt, true) }
}
