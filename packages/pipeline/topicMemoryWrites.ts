// commits the eligible Topic Memory writes for one completed Scan
import { TOPIC_MEMORY_FACT_FORMAT_VERSION } from "@carlnotes/contracts/topicMemoryWork"
import { type DbTransaction, db } from "@carlnotes/db"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { scans } from "@carlnotes/db/schema/scans"
import { eq } from "drizzle-orm"
import {
	type ApplyTopicMemoryWriteOptions,
	applyTopicMemoryWrite,
	type EmbeddedTopicMemoryWrite,
	loadRejectedTopicMemoryWrites,
	type TopicMemoryMergedPair,
} from "./applyTopicMemoryWrite"
import { limitActiveTopicMemories } from "./topicMemoryCleanup"
import { loadEligibleTopicMemoryFindingIds, loadTopicMemoryScan } from "./topicMemoryEvidence"
import { saveTopicMemorySubjects, type TopicMemorySubjectEntry } from "./topicMemorySubjects"

// the Scan and its Topic, the writes to save, and the signal that ends the update
type SaveTopicMemoryUpdatesOptions = {
	scanId: string
	topicId: string
	writes: EmbeddedTopicMemoryWrite[]
	signal: AbortSignal
	// the pairs that the update merged, each write's stored id, and the replacements that the review confirmed
	mergedPairs?: TopicMemoryMergedPair[]
	writeResults?: Map<EmbeddedTopicMemoryWrite, string>
	replacements?: ReadonlyMap<EmbeddedTopicMemoryWrite, NonNullable<ApplyTopicMemoryWriteOptions["replacement"]>>
}

/** Commits one Scan's topic memory updates and limits active rows in the same transaction. */
export async function saveTopicMemoryUpdates({
	scanId,
	topicId,
	writes,
	signal,
	mergedPairs,
	writeResults,
	replacements,
}: SaveTopicMemoryUpdatesOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		// serialize with feedback and changes to public evidence
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		const scan = topic && (await loadTopicMemoryScan(scanId, transaction))
		// a Scan of another Topic, a Scan already updated, and a Topic with Personal sources left to convert save nothing
		if (
			scan?.topicId !== topicId ||
			scan.topicMemoriesUpdatedAt ||
			(await hasUnconvertedPersonalSources(topicId, transaction))
		) {
			return
		}

		// verify eligible sources, apply updates, and mark completion atomically
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
			replacements,
		})
		signal.throwIfAborted()
		await limitActiveTopicMemories(transaction, topicId, now)
		await transaction
			.update(scans)
			.set({
				topicMemoriesUpdatedAt: now,
				topicMemoriesWrittenAt: now,
				topicMemoriesFormatVersion: TOPIC_MEMORY_FACT_FORMAT_VERSION,
			})
			.where(eq(scans.id, scanId))
		signal.throwIfAborted()
	})
}

// verify that all source Findings are still eligible before any write can use them
async function applyEligibleTopicMemoryWrites(
	transaction: DbTransaction,
	{
		writes,
		signal,
		writeResults,
		replacements,
		...options
	}: Omit<ApplyTopicMemoryWriteOptions, "write" | "replacement" | "isRejected"> &
		Pick<SaveTopicMemoryUpdatesOptions, "writes" | "signal" | "writeResults" | "replacements">,
): Promise<void> {
	if (writes.length === 0) {
		return
	}
	const eligibleIds = new Set(await loadEligibleTopicMemoryFindingIds(options.scanId, options.topicId, transaction))
	// save selected peers before a surplus paraphrase checks whether its fact is already present
	const orderedWrites = writes.toSorted(
		(left, right) => Number(shouldCombineWithExactMatch(left)) - Number(shouldCombineWithExactMatch(right)),
	)

	// the Topic's rejected topic memories are read once for every write, and the subjects are saved in one statement
	// after the last write, so the Topic lock is held for as few statements as the writes need
	const rejectedWrites = await loadRejectedTopicMemoryWrites(transaction, options.topicId, orderedWrites)
	const subjectEntries: TopicMemorySubjectEntry[] = []
	for (const write of orderedWrites) {
		signal.throwIfAborted()
		if (write.findingIds.length === 0 || write.findingIds.some((id) => !eligibleIds.has(id))) {
			continue
		}
		const memoryId = await applyTopicMemoryWrite(transaction, {
			...options,
			write,
			replacement: replacements?.get(write),
			isRejected: rejectedWrites.has(write),
		})
		if (memoryId) {
			// the established spelling comes before an alias of it whose public Finding is still eligible
			writeResults?.set(write, memoryId)
			subjectEntries.push({ identity: write })
			if (write.subjectAlias && eligibleIds.has(write.subjectAlias.findingId)) {
				subjectEntries.push({ identity: write, evidence: write.subjectAlias })
			}
		}
	}
	// save the subjects of the writes that were stored
	await saveTopicMemorySubjects(transaction, options.topicId, subjectEntries)
}

function shouldCombineWithExactMatch({ reconciliation }: EmbeddedTopicMemoryWrite): boolean {
	return reconciliation?.operation === "add" && reconciliation.combineWithExactMatch === true
}
