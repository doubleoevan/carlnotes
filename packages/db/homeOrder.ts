// a row's position among the pinned rows of its table, a topic in the Home topics or a podcast episode among the
// home podcast episodes: the write that inserts it at a position and the release that closes the gap it leaves

import { and, count, eq, gt, gte, isNotNull, sql } from "drizzle-orm"
import type { DbHandle, DbTransaction } from "./index"
import type { podcastEpisodes } from "./schema/podcast"
import type { topics } from "./schema/topics"

// the tables with a home order. each has an id and a nullable whole-number homeOrder column
type HomeOrderTable = typeof topics | typeof podcastEpisodes

/**
 * Sets a row's position among its table's pinned rows, inside the caller's transaction. Position 0 clears it. Any
 * other position inserts the row there and pushes whatever held it, and everything below, down one. A position past
 * the end appends. A row that is already pinned leaves its old position, and the gap closes before it is inserted.
 */
export async function setHomeOrder({
	table,
	id,
	position,
	transaction,
}: {
	table: HomeOrderTable
	id: string
	position: number
	transaction: DbTransaction
}): Promise<void> {
	// leave the current position, then take the new one
	await releaseHomeOrder({ table, id, handle: transaction })
	if (position <= 0) {
		return
	}

	// how many rows are pinned, so a position past the end appends
	const [homeOrderRow] = await transaction.select({ count: count() }).from(table).where(isNotNull(table.homeOrder))
	const targetPosition = toTargetPosition(position, homeOrderRow?.count ?? 0)

	// push everything from the target position down, then set the row's home order
	await transaction
		.update(table)
		.set({ homeOrder: sql`${table.homeOrder} + 1` })
		.where(and(isNotNull(table.homeOrder), gte(table.homeOrder, targetPosition)))
	await transaction.update(table).set({ homeOrder: targetPosition }).where(eq(table.id, id))
}

/**
 * The position a pinned row will take as an insert or an append
 */
export function toTargetPosition(position: number, homeCount: number): number {
	return Math.min(position, homeCount + 1)
}

/**
 * Clears a row's home order and closes the gap it leaves by moving everything below it up one. Returns whether the
 * row had one.
 */
export async function releaseHomeOrder({
	table,
	id,
	handle,
}: {
	table: HomeOrderTable
	id: string
	handle: DbHandle
}): Promise<boolean> {
	// a row with no order has nothing to release and nothing below it to move
	const [homeOrderRow] = await handle.select({ homeOrder: table.homeOrder }).from(table).where(eq(table.id, id))
	if (homeOrderRow?.homeOrder == null) {
		return false
	}

	// clear the row's home order, then pull everything that was below it up one
	await handle.update(table).set({ homeOrder: null }).where(eq(table.id, id))
	await handle
		.update(table)
		.set({ homeOrder: sql`${table.homeOrder} - 1` })
		.where(and(isNotNull(table.homeOrder), gt(table.homeOrder, homeOrderRow.homeOrder)))
	return true
}
