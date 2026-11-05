// fetched Source limits share the Topic lock with receiving and editor saves
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { and, count, eq, isNull } from "drizzle-orm"
import type { DbTransaction } from "./index"
import { sources } from "./schema/topics"

export class FetchedSourceLimitError extends Error {
	constructor() {
		super(
			`A Topic can hold at most ${MAX_TOPIC_SOURCES} fetched Sources. Personal sources do not count toward this limit.`,
		)
	}
}

/**
 * Checks fetched capacity while the caller holds the Topic lock.
 */
export async function assertFetchedSourceCapacity(transaction: DbTransaction, topicId: string): Promise<void> {
	const [sourceCount] = await transaction
		.select({ count: count() })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), isNull(sources.personalSourcesIdentity)))
	if ((sourceCount?.count ?? 0) >= MAX_TOPIC_SOURCES) {
		throw new FetchedSourceLimitError()
	}
}
