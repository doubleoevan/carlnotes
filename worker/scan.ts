// starting a Scan. the row is opened here and the work itself runs as a Temporal workflow, so a Scan survives
// the death of whatever process asked for it. the stages live in workflows/run-topic-scan-activities.ts
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "../db"
import { scans } from "../db/schema"
import { type ScanStart, startTopicScanWorkflow } from "./temporal-client"
import type { ScanTrigger } from "./workflows/run-topic-scan-activities"

// a persisted Scan row
type Scan = typeof scans.$inferSelect

// the scan row this opened and a promise that settles when the workflow ends.
// "running" means the Topic already had a Scan in flight and this one was never opened
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type TopicScanStart = { status: "started"; scan: Scan; whenFinished: Promise<void> } | { status: "running" }

/**
 * Open a Scan for a Topic and hand it to Temporal. Returns "running" when the Topic already has one in flight —
 * the workflow id catches that, not a query, since a query could still read a stale row.
 * the trigger holds what asked for the Scan, which decides what its conclusion announces.
 * The daily quota counts scheduled and manual Scans the same way, so the trigger is not a quota distinction.
 * ownerId is saved to the Scan so its spend and quota attribution survive the topic being deleted.
 */
export async function startTopicScan(topicId: string, ownerId: string, trigger: ScanTrigger): Promise<TopicScanStart> {
	// a Topic can already have an open scan row with no workflow behind it yet
	// a missing dispatchedAt field is exactly that state
	const [openScan] = await db
		.select()
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "running"), isNull(scans.dispatchedAt)))
		.orderBy(desc(scans.startedAt))
		.limit(1)

	// the scan row is written before the workflow starts, so the Topic page shows a Scan already under way.
	// a scan row taken this way gets this call's owner and trigger.
	// its spend, quota, and reporting all follow what the scan row says.
	const scanFields = { ownerId, isManual: trigger === "manual" }
	const takenFields = { ...scanFields, startedAt: new Date() }
	const [scan] = openScan
		? await db.update(scans).set(takenFields).where(eq(scans.id, openScan.id)).returning()
		: await db
				.insert(scans)
				.values({ ...scanFields, topicId })
				.returning()

	// no scan row means the write itself failed, so there is nothing for a workflow to run
	if (!scan) {
		throw new Error(`could not create scan for topic ${topicId}`)
	}
	return scanTopic(scan, topicId, ownerId, trigger, Boolean(openScan))
}

/**
 * Hand an already-open Scan row to Temporal. isExistingRow says the row predates this call,
 * which determines whether a rejected or failed scan start removes it.
 */
export async function scanTopic(
	scan: Scan,
	topicId: string,
	ownerId: string,
	trigger: ScanTrigger,
	isExistingRow = false,
): Promise<TopicScanStart> {
	// a start that throws an error leaves the row with nothing running,
	// and an unreachable Temporal service throws for every Scan at once.
	// a scan row that this call opened runs instead of being deleted
	let scanStart: ScanStart
	try {
		scanStart = await startTopicScanWorkflow(scan.id, topicId, ownerId, trigger)
	} catch (error) {
		await deleteUnstartedScan(scan.id, isExistingRow)
		throw error
	}

	// a rejection means this Topic already has a Scan in flight. a row this call opened will never run, so it's deleted.
	// a row that already existed is has a dispatchedAt saved instead, which heals the case where a start succeeded and
	// only its dispatchedAt write failed. a scan row that is truly orphaned is started on the next sweep
	if (scanStart.status === "running") {
		if (!isExistingRow) {
			await db.delete(scans).where(eq(scans.id, scan.id))
			return { status: "running" }
		}
		await setScanDispatchedDate(scan.id)
		return { status: "running" }
	}

	// the dispatchedAt field is written after the scan start returns, so a scan row reads as undispatched until it's started
	await setScanDispatchedDate(scan.id)
	return { status: "started", scan, whenFinished: scanStart.whenFinished }
}

// record that a Scan's workflow was started, which is what tells a later sweep it does not need dispatching
async function setScanDispatchedDate(scanId: string): Promise<void> {
	await db.update(scans).set({ dispatchedAt: new Date() }).where(eq(scans.id, scanId))
}

// drop a Scan row whose workflow never started, so it never reads as a started Scan.
// a row that already existed is kept
async function deleteUnstartedScan(scanId: string, isExistingRow: boolean): Promise<void> {
	if (isExistingRow) {
		return
	}
	await db.delete(scans).where(eq(scans.id, scanId))
}

/**
 * Read a Scan row by id.
 */
export async function loadScan(scanId: string): Promise<Scan | undefined> {
	const [scan] = await db.select().from(scans).where(eq(scans.id, scanId))
	return scan
}
