// a row's position among the pinned rows that share one order: the topics, the podcast episodes, the films, or the
// Topic Posts pinned to the home, or the ones a person pinned to their profile. the write that inserts a row at a
// position and the release that closes the gap it leaves

import { and, count, eq, gt, gte, isNotNull, type SQL, sql } from "drizzle-orm"
import type { DbHandle, DbTransaction } from "./index"
import type { podcastEpisodes, topicPodcastEpisodeVideos } from "./schema/podcast"
import type { topicPosts } from "./schema/topicPosts"
import type { topics } from "./schema/topics"

// the tables with pinned orders. each has an id, a nullable whole-number home order, and a nullable profile order
export type PinnedOrderTable =
	| typeof topics
	| typeof podcastEpisodes
	| typeof topicPodcastEpisodeVideos
	| typeof topicPosts

// the tables whose pinned rows belong to a topic
export type TopicPinnedOrderTable = typeof podcastEpisodes | typeof topicPosts

// the column that holds a pinned order
type PinnedOrderColumnKey = "homeOrder" | "profileOrder"

// one pinned order: its table, the column that holds it, and the filter for the rows that share it. no filter is
// every row of the table
export type PinnedOrder = { table: PinnedOrderTable; columnKey: PinnedOrderColumnKey; scopeFilter?: SQL }

/**
 * Sets a row's position among the pinned rows of its order, inside the caller's transaction. Position 0 clears it.
 * Any other position inserts the row there and pushes whatever held it, and everything below, down one. A position
 * past the end appends. A row that is already pinned leaves its old position, and the gap closes before it is
 * inserted. Returns false and changes nothing if the order is at its limit and the row is not pinned yet.
 */
export async function setPinnedOrder({
	pinnedOrder,
	id,
	position,
	limit,
	transaction,
}: {
	pinnedOrder: PinnedOrder
	id: string
	position: number
	limit?: number
	transaction: DbTransaction
}): Promise<boolean> {
	// a new pin on a full order changes nothing. a pinned row still moves, and a clear still clears
	if (limit !== undefined && position > 0 && (await isNewPinPastLimit({ pinnedOrder, id, limit, transaction }))) {
		return false
	}

	// leave the current position, then take the new one
	await releasePinnedOrder({ pinnedOrder, id, handle: transaction })
	if (position <= 0) {
		return true
	}

	// how many rows are pinned, so a position past the end appends
	const { table, columnKey } = pinnedOrder
	const orderColumn = table[columnKey]
	const targetPosition = toTargetPosition(position, await countPinnedRows(pinnedOrder, transaction))

	// push everything from the target position down, then set the row's order
	await transaction
		.update(table)
		.set(toOrderValues(columnKey, sql`${orderColumn} + 1`))
		.where(and(toPinnedFilter(pinnedOrder), gte(orderColumn, targetPosition)))
	await transaction.update(table).set(toOrderValues(columnKey, targetPosition)).where(eq(table.id, id))
	return true
}

/**
 * Returns the position a pinned row takes, as an insert at a position or an append past the end.
 */
export function toTargetPosition(position: number, pinnedCount: number): number {
	return Math.min(position, pinnedCount + 1)
}

/**
 * Clears a row's position in a pinned order and closes the gap it leaves by moving everything below it up one.
 * Returns whether the row had one.
 */
export async function releasePinnedOrder({
	pinnedOrder,
	id,
	handle,
}: {
	pinnedOrder: PinnedOrder
	id: string
	handle: DbHandle
}): Promise<boolean> {
	// a row with no order has nothing to release and nothing below it to move
	const { table, columnKey } = pinnedOrder
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
		.where(and(toPinnedFilter(pinnedOrder), gt(orderColumn, orderRow.order)))
	return true
}

// whether pinning the row would add a pin to an order that already holds its limit
async function isNewPinPastLimit({
	pinnedOrder,
	id,
	limit,
	transaction,
}: {
	pinnedOrder: PinnedOrder
	id: string
	limit: number
	transaction: DbTransaction
}): Promise<boolean> {
	// a row that is already pinned only moves, which adds nothing
	const { table, columnKey } = pinnedOrder
	const [orderRow] = await transaction.select({ order: table[columnKey] }).from(table).where(eq(table.id, id))
	if (orderRow?.order != null) {
		return false
	}
	return (await countPinnedRows(pinnedOrder, transaction)) >= limit
}

// how many rows the order holds
async function countPinnedRows(pinnedOrder: PinnedOrder, handle: DbHandle): Promise<number> {
	const [pinnedCountRow] = await handle
		.select({ count: count() })
		.from(pinnedOrder.table)
		.where(toPinnedFilter(pinnedOrder))
	return pinnedCountRow?.count ?? 0
}

// the filter for the rows that hold a position in the order
function toPinnedFilter({ table, columnKey, scopeFilter }: PinnedOrder): SQL | undefined {
	return and(isNotNull(table[columnKey]), scopeFilter)
}

// the column value that an update sets, under the order's own column
function toOrderValues(
	columnKey: PinnedOrderColumnKey,
	order: number | SQL | null,
): { homeOrder: number | SQL | null } | { profileOrder: number | SQL | null } {
	return columnKey === "homeOrder" ? { homeOrder: order } : { profileOrder: order }
}
