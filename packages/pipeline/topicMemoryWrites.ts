// commits the eligible Topic Memory writes for one completed Scan
import { TOPIC_MEMORY_CLEANUP_INTERVAL, TOPIC_MEMORY_FACT_FORMAT_VERSION } from "@carlnotes/contracts/topicMemoryWork"
import { type DbTransaction, db } from "@carlnotes/db"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { scans } from "@carlnotes/db/schema/scans"
import { and, eq, lte, sql } from "drizzle-orm"
import {
	type ApplyTopicMemoryWriteOptions,
	applyTopicMemoryWrite,
	type EmbeddedTopicMemoryWrite,
	type TopicMemoryMergedPair,
} from "./applyTopicMemoryWrite"
import { applyTopicMemoryRetention } from "./topicMemoryCleanup"
import {
	loadTopicMemoryCleanupPairs,
	type TopicMemoryCleanupPair,
	type TopicMemoryCleanupReview,
} from "./topicMemoryCleanupPairs"
import { loadEligibleTopicMemoryFindingIds, loadTopicMemoryScan } from "./topicMemoryEvidence"

type SaveTopicMemoryUpdatesOptions = {
	scanId: string
	topicId: string
	writes: EmbeddedTopicMemoryWrite[]
	signal: AbortSignal
	mergedPairs?: TopicMemoryMergedPair[]
	writeResults?: Map<EmbeddedTopicMemoryWrite, string>
	confirmCleanup?: (pairs: TopicMemoryCleanupPair[]) => Promise<TopicMemoryCleanupReview[]>
}

/** Commits writes once. A cleanup Scan asks the model outside the locked transactions. */
export async function saveTopicMemoryUpdates({
	scanId,
	topicId,
	writes,
	signal,
	mergedPairs,
	writeResults,
	confirmCleanup,
}: SaveTopicMemoryUpdatesOptions): Promise<void> {
	const shouldReview = await db.transaction(async (transaction) => {
		// serialize with feedback and changes to public evidence
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		const scan = topic && (await loadTopicMemoryScan(scanId, transaction))
		// the succeeded Scan and its public evidence must still belong to the locked Topic
		if (
			scan?.topicId !== topicId ||
			scan.topicMemoriesUpdatedAt ||
			(await hasUnconvertedPersonalSources(topicId, transaction))
		) {
			return false
		}
		// a retry after the first transaction only needs to finish its cleanup
		if (scan.topicMemoriesWrittenAt) {
			return true
		}

		const now = new Date()
		await applyEligibleTopicMemoryWrites(transaction, {
			writes,
			scanId,
			topicId,
			startedAt: scan.startedAt,
			now,
			signal,
			mergedPairs,
			writeResults,
		})

		const isCleanupScan = await isTopicMemoryCleanupScan(transaction, { topicId, scanId, startedAt: scan.startedAt })
		signal.throwIfAborted()
		if (isCleanupScan) {
			await transaction
				.update(scans)
				.set({
					topicMemoriesWrittenAt: now,
					topicMemoriesUpdatedAt: null,
					topicMemoriesFormatVersion: TOPIC_MEMORY_FACT_FORMAT_VERSION,
				})
				.where(eq(scans.id, scanId))
			return true
		}
		await finishTopicMemoryUpdate(transaction, { scanId, topicId, now, signal, shouldCleanUp: false })
		return false
	})
	if (!shouldReview) {
		return
	}

	// the exact pair sent to the model is checked again under the Topic lock before combining it
	const pairs = await loadTopicMemoryCleanupPairs(topicId)
	const reviews = pairs.length && confirmCleanup ? await confirmCleanup(pairs) : []
	await db.transaction(async (transaction) => {
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		const scan = topic && (await loadTopicMemoryScan(scanId, transaction))
		if (
			scan?.topicId !== topicId ||
			scan.topicMemoriesUpdatedAt ||
			(await hasUnconvertedPersonalSources(topicId, transaction))
		) {
			return
		}
		await finishTopicMemoryUpdate(transaction, {
			scanId,
			topicId,
			signal,
			now: new Date(),
			shouldCleanUp: true,
			reviews,
			mergedPairs,
		})
	})
}

// verify that all source Findings are still eligible before any write can use them
async function applyEligibleTopicMemoryWrites(
	transaction: DbTransaction,
	{
		writes,
		signal,
		writeResults,
		...options
	}: Omit<ApplyTopicMemoryWriteOptions, "write"> &
		Pick<SaveTopicMemoryUpdatesOptions, "writes" | "signal" | "writeResults">,
): Promise<void> {
	if (writes.length === 0) {
		return
	}
	const eligibleIds = new Set(await loadEligibleTopicMemoryFindingIds(options.scanId, options.topicId, transaction))
	for (const write of writes) {
		signal.throwIfAborted()
		if (write.findingIds.length === 0 || write.findingIds.some((id) => !eligibleIds.has(id))) {
			continue
		}
		const memoryId = await applyTopicMemoryWrite(transaction, { ...options, write })
		if (memoryId) {
			writeResults?.set(write, memoryId)
		}
	}
}

// a Scan's ordinal is independent of workflow completion and backfill order
async function isTopicMemoryCleanupScan(
	transaction: DbTransaction,
	{
		topicId,
		scanId,
		startedAt,
	}: {
		topicId: string
		scanId: string
		startedAt: Date
	},
): Promise<boolean> {
	const [ordinal] = await transaction
		.select({ count: sql<number>`count(*)::int` })
		.from(scans)
		.where(
			and(
				eq(scans.topicId, topicId),
				eq(scans.status, "succeeded"),
				lte(scans.startedAt, startedAt),
				sql`(${scans.startedAt}, ${scans.id}) <= (${startedAt.toISOString()}::timestamptz, ${scanId})`,
			),
		)
	return Boolean(ordinal?.count && ordinal.count % TOPIC_MEMORY_CLEANUP_INTERVAL === 0)
}

async function finishTopicMemoryUpdate(
	transaction: DbTransaction,
	options: {
		scanId: string
		topicId: string
		signal: AbortSignal
		now: Date
		shouldCleanUp: boolean
		reviews?: TopicMemoryCleanupReview[]
		mergedPairs?: TopicMemoryMergedPair[]
	},
): Promise<void> {
	const { scanId, signal, now } = options
	signal.throwIfAborted()
	await applyTopicMemoryRetention(transaction, options)
	signal.throwIfAborted()
	await transaction
		.update(scans)
		.set({ topicMemoriesUpdatedAt: now, topicMemoriesFormatVersion: TOPIC_MEMORY_FACT_FORMAT_VERSION })
		.where(eq(scans.id, scanId))
	signal.throwIfAborted()
}

/** Records each paid call, including drafts that cannot be applied on this attempt. */
export async function recordTopicMemorySpend(scanId: string, dollars: number): Promise<void> {
	if (dollars <= 0) {
		return
	}
	const amount = dollars.toFixed(6)
	await db
		.update(scans)
		.set({
			cost: sql`${scans.cost} + ${amount}::numeric`,
			stageCosts: sql`jsonb_set(${scans.stageCosts}, '{topicMemories}',
			to_jsonb(coalesce((${scans.stageCosts}->>'topicMemories')::numeric, 0) + ${amount}::numeric))`,
		})
		.where(eq(scans.id, scanId))
}
