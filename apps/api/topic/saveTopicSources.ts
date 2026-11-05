// fetched Source reconciliation preserves asynchronously received Personal sources
import type { UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import type { DbTransaction } from "@carlnotes/db"
import { sources } from "@carlnotes/db/schema/topics"
import { FetchedSourceLimitError } from "@carlnotes/db/topicSourceCapacity"
import { and, count, eq, isNull, notInArray } from "drizzle-orm"
import { toNewSourceRow } from "./saveHelpers"

/**
 * Reconciles fetched Sources while retaining hidden receiving Sources under the Topic lock.
 */
export async function reconcileTopicSources({
	transaction,
	topicId,
	payloadSources,
	podcastNames,
}: {
	transaction: DbTransaction
	topicId: string
	payloadSources: UpdateTopicPayload["sources"]
	podcastNames: Map<string, string>
}): Promise<(typeof sources.$inferSelect)["kind"][]> {
	// separate newly staged Sources from saved ids
	const newSources = payloadSources.flatMap((topicSource) => ("id" in topicSource ? [] : [topicSource]))
	// reconcile sources: keep the rows the payload names by id, delete the rest, insert the ones without an id
	const keptSourceIds = payloadSources.flatMap((topicSource) => ("id" in topicSource ? [topicSource.id] : []))
	const staleSourceFilter =
		keptSourceIds.length > 0
			? and(eq(sources.topicId, topicId), notInArray(sources.id, keptSourceIds))
			: eq(sources.topicId, topicId)
	// the deleted rows come back with their kinds, for the events reported after the transaction
	const removedSourceRows = await transaction
		.delete(sources)
		.where(and(staleSourceFilter, isNull(sources.personalSourcesIdentity)))
		.returning({ kind: sources.kind })

	// insert the newly added sources. the flatMap narrows the union to the members with source kind and source config
	if (newSources.length > 0) {
		const [sourceCount] = await transaction
			.select({ count: count() })
			.from(sources)
			.where(and(eq(sources.topicId, topicId), isNull(sources.personalSourcesIdentity)))
		if ((sourceCount?.count ?? 0) + newSources.length > MAX_TOPIC_SOURCES) {
			throw new FetchedSourceLimitError()
		}
		await transaction
			.insert(sources)
			.values(newSources.map((topicSource) => toNewSourceRow(topicId, topicSource, podcastNames)))
	}
	return removedSourceRows.map((removedSourceRow) => removedSourceRow.kind)
}
