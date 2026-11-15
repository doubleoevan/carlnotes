// a row's position among the featured rows that share one order: the topics, the podcast episodes, the films, or the
// Topic Posts featured on the home, or the ones a person featured on their profile. the write that inserts a row at a
// position and the release that closes the gap it leaves

import { and, count, eq, gt, gte, isNotNull, type SQL, sql } from "drizzle-orm"
import type { DbHandle, DbTransaction } from "./index"
import type { podcastEpisodes, topicVideos } from "./schema/podcast"
import type { topicPosts } from "./schema/topicPosts"
import type { topics } from "./schema/topics"

// the tables with featured orders. each has an id, a nullable whole-number home order, and a nullable profile order
export type FeaturedOrderTable = typeof topics | typeof podcastEpisodes | typeof topicVideos | typeof topicPosts

// the tables whose featured rows belong to a topic
export type TopicFeaturedOrderTable = typeof podcastEpisodes | typeof topicPosts

// the column that holds a featured order
type FeaturedOrderColumnKey = "homeOrder" | "profileOrder"

// one featured order: its table, the column that holds it, and the filter for the rows that share it. no filter is
// every row of the table
export type FeaturedOrder = { table: FeaturedOrderTable; columnKey: FeaturedOrderColumnKey; scopeFilter?: SQL }

/**
 * Sets a row's position among the featured rows of its order, inside the caller's transaction. Position 0 clears it.
 * Any other position inserts the row there and pushes whatever held it, and everything below, down one. A position
 * past the end appends. A row that is already featured leaves its old position, and the gap closes before it is
 * inserted. Returns false and changes nothing if the order is at its limit and the row is not featured yet.
 */
export async function setFeaturedOrder({
	featuredOrder,
	id,
	position,
	limit,
	transaction,
}: {
	featuredOrder: FeaturedOrder
	id: string
	position: number
	limit?: number
	transaction: DbTransaction
}): Promise<boolean> {
	// a new featured item on a full order changes nothing. a featured row still moves, and a clear still clears
	if (limit !== undefined && position > 0 && (await isNewFeaturePastLimit({ featuredOrder, id, limit, transaction }))) {
		return false
	}

	// leave the current position, then take the new one
	await releaseFeaturedOrder({ featuredOrder, id, handle: transaction })
	if (position <= 0) {
		return true
	}

	// how many rows are featured, so a position past the end appends
	const { table, columnKey } = featuredOrder
	const orderColumn = table[columnKey]
	const targetPosition = toTargetPosition(position, await countFeaturedRows(featuredOrder, transaction))

	// push everything from the target position down, then set the row's order
	await transaction
		.update(table)
		.set(toOrderValues(columnKey, sql`${orderColumn} + 1`))
		.where(and(toFeaturedFilter(featuredOrder), gte(orderColumn, targetPosition)))
	await transaction.update(table).set(toOrderValues(columnKey, targetPosition)).where(eq(table.id, id))
	return true
}

/**
 * Returns the position a featured row takes, as an insert at a position or an append past the end.
 */
export function toTargetPosition(position: number, featuredCount: number): number {
	return Math.min(position, featuredCount + 1)
}

/**
 * Clears a row's position in a featured order and closes the gap it leaves by moving everything below it up one.
 * Returns whether the row had one.
 */
export async function releaseFeaturedOrder({
	featuredOrder,
	id,
	handle,
}: {
	featuredOrder: FeaturedOrder
	id: string
	handle: DbHandle
}): Promise<boolean> {
	// a row with no order has nothing to release and nothing below it to move
	const { table, columnKey } = featuredOrder
	const orderColumn = table[columnKey]
	const [orderRow] = await handle.select({ order: orderColumn }).from(table).where(eq(table.id, id))
	if (orderRow?.order == null) {
		return false
	}

	// clear the row's order, then pull everything that was below it up one
	await handle.update(table).set(toOrderValues(columnKey, null)).where(eq(table.id, id))
	await handle
		.update(table)
		.set(toOrderValues(columnKey, sql`${orderColumn} - 1`))
		.where(and(toFeaturedFilter(featuredOrder), gt(orderColumn, orderRow.order)))
	return true
}

// whether featuring the row would add a featured row to an order that already holds its limit
async function isNewFeaturePastLimit({
	featuredOrder,
	id,
	limit,
	transaction,
}: {
	featuredOrder: FeaturedOrder
	id: string
	limit: number
	transaction: DbTransaction
}): Promise<boolean> {
	// a row that is already featured only moves, which adds nothing
	const { table, columnKey } = featuredOrder
	const [orderRow] = await transaction.select({ order: table[columnKey] }).from(table).where(eq(table.id, id))
	if (orderRow?.order != null) {
		return false
	}
	return (await countFeaturedRows(featuredOrder, transaction)) >= limit
}

// how many rows the order holds
async function countFeaturedRows(featuredOrder: FeaturedOrder, handle: DbHandle): Promise<number> {
	const [featuredCountRow] = await handle
		.select({ count: count() })
		.from(featuredOrder.table)
		.where(toFeaturedFilter(featuredOrder))
	return featuredCountRow?.count ?? 0
}

// the filter for the rows that hold a position in the order
function toFeaturedFilter({ table, columnKey, scopeFilter }: FeaturedOrder): SQL | undefined {
	return and(isNotNull(table[columnKey]), scopeFilter)
}

// the column value that an update sets, under the order's own column
function toOrderValues(
	columnKey: FeaturedOrderColumnKey,
	order: number | SQL | null,
): { homeOrder: number | SQL | null } | { profileOrder: number | SQL | null } {
	return columnKey === "homeOrder" ? { homeOrder: order } : { profileOrder: order }
}
