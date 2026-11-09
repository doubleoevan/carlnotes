// a row's position among the featured rows of its table, a topic in the Featured section or a podcast episode among the
// home's featured episodes: the write that inserts it at a position and the release that closes the gap it leaves

import { and, count, eq, gt, gte, isNotNull, sql } from "drizzle-orm"
import type { DbHandle, DbTransaction } from "./index"
import type { podcastEpisodes } from "./schema/podcast"
import type { topics } from "./schema/topics"

// the tables with a feature order. each has an id and a nullable whole-number featureOrder column
type FeatureOrderTable = typeof topics | typeof podcastEpisodes

/**
 * Sets a row's position among its table's featured rows, inside the caller's transaction. Position 0 clears it. Any
 * other position inserts the row there and pushes whatever held it, and everything below, down one. A position past
 * the end appends. A row that is already featured leaves its old position, and the gap closes before it is inserted.
 */
export async function setFeatureOrder({
	table,
	id,
	position,
	transaction,
}: {
	table: FeatureOrderTable
	id: string
	position: number
	transaction: DbTransaction
}): Promise<void> {
	// leave the current position, then take the new one
	await releaseFeatureOrder({ table, id, handle: transaction })
	if (position <= 0) {
		return
	}

	// how many rows are featured, so a position past the end appends
	const [featuredRow] = await transaction.select({ count: count() }).from(table).where(isNotNull(table.featureOrder))
	const targetPosition = toTargetPosition(position, featuredRow?.count ?? 0)

	// push everything from the target position down, then set the row's feature order
	await transaction
		.update(table)
		.set({ featureOrder: sql`${table.featureOrder} + 1` })
		.where(and(isNotNull(table.featureOrder), gte(table.featureOrder, targetPosition)))
	await transaction.update(table).set({ featureOrder: targetPosition }).where(eq(table.id, id))
}

/**
 * The position a featured row will take as an insert or an append
 */
export function toTargetPosition(position: number, featuredCount: number): number {
	return Math.min(position, featuredCount + 1)
}

/**
 * Clears a row's feature order and closes the gap it leaves by moving everything below it up one. Returns whether the
 * row had one.
 */
export async function releaseFeatureOrder({
	table,
	id,
	handle,
}: {
	table: FeatureOrderTable
	id: string
	handle: DbHandle
}): Promise<boolean> {
	// a row with no order has nothing to release and nothing below it to move
	const [featuredRow] = await handle.select({ featureOrder: table.featureOrder }).from(table).where(eq(table.id, id))
	if (featuredRow?.featureOrder == null) {
		return false
	}

	// clear the row's feature order, then pull everything that was below it up one
	await handle.update(table).set({ featureOrder: null }).where(eq(table.id, id))
	await handle
		.update(table)
		.set({ featureOrder: sql`${table.featureOrder} - 1` })
		.where(and(isNotNull(table.featureOrder), gt(table.featureOrder, featuredRow.featureOrder)))
	return true
}
