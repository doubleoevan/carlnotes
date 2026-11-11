// a row's position among the rows pinned to the home, a topic in the Home topics, a podcast episode among the home
// podcast episodes, a film among the home films, or a Topic Post among the home Topic Posts: the write that inserts
// it at a position and the release that closes the gap it leaves, for one row and for every row of a topic

import { and, eq, isNotNull } from "drizzle-orm"
import type { DbHandle, DbTransaction } from "./index"
import { type PinnedOrderTable, releasePinnedOrder, setPinnedOrder, type TopicPinnedOrderTable } from "./pinnedOrder"

/**
 * Sets a row's position among its table's rows pinned to the home, inside the caller's transaction. Position 0 clears
 * it. Any other position inserts the row there and pushes whatever held it, and everything below, down one. A
 * position past the end appends.
 */
export async function setHomeOrder({
	table,
	id,
	position,
	transaction,
}: {
	table: PinnedOrderTable
	id: string
	position: number
	transaction: DbTransaction
}): Promise<void> {
	await setPinnedOrder({ pinnedOrder: { table, columnKey: "homeOrder" }, id, position, transaction })
}

/**
 * Clears a row's home order and closes the gap it leaves by moving everything below it up one. Returns whether the
 * row had one.
 */
export function releaseHomeOrder({
	table,
	id,
	handle,
}: {
	table: PinnedOrderTable
	id: string
	handle: DbHandle
}): Promise<boolean> {
	return releasePinnedOrder({ pinnedOrder: { table, columnKey: "homeOrder" }, id, handle })
}

/**
 * Clears the home order of every podcast episode or every Topic Post of a topic, one at a time so the orders stay
 * contiguous. Returns whether any had one.
 */
export async function releaseTopicHomeOrders({
	table,
	topicId,
	handle,
}: {
	table: TopicPinnedOrderTable
	topicId: string
	handle: DbHandle
}): Promise<boolean> {
	// the topic's pinned rows, each released on its own so the gap closes each time
	const homeOrderRows = await handle
		.select({ id: table.id })
		.from(table)
		.where(and(eq(table.topicId, topicId), isNotNull(table.homeOrder)))

	// release each in turn
	for (const homeOrderRow of homeOrderRows) {
		await releaseHomeOrder({ table, id: homeOrderRow.id, handle })
	}
	return homeOrderRows.length > 0
}
