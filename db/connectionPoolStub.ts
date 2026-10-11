// the connection pool stub that the tests share, and the table row builder for the rows that the stub returns
import { getTableColumns, type Table } from "drizzle-orm"
import { connectionPool, db } from "./index"
import { countRequestStatement } from "./queryTracing"

// the connection pool's own query and the client's own transaction, which restoreConnectionPool puts back
const originalConnectionPoolQuery = connectionPool.query
const originalDbTransaction = db.transaction

// a query that the stubbed connection pool was sent: its sql and its values
export type SentQuery = { text: string; values: unknown[] }

// a free user's and an admin's access rows, in the column order the access read selects: role, plan, budget override
export const FREE_USER_ACCESS_ROW = ["user", "free", null]
export const ADMIN_USER_ACCESS_ROW = ["admin", "free", null]

/**
 * Swaps the connection pool's query for a stub that returns the rows that toQueryRows picks, and returns each query sent.
 * A query sent inside a request counts toward the request's queries, and a transaction runs its callback on the stubbed client.
 */
export function stubConnectionPool(toQueryRows: (sentQuery: SentQuery) => unknown[] = () => []): SentQuery[] {
	// the stubbed query
	const sentQueries: SentQuery[] = []
	connectionPool.query = (async (queryConfig: string | { text: string }, values: unknown[] = []) => {
		// keep and count the query, then return its rows. a toQueryRows that throws an error fails that query
		const sentQuery = { text: typeof queryConfig === "string" ? queryConfig : queryConfig.text, values }
		sentQueries.push(sentQuery)
		countRequestStatement(sentQuery.text)
		const rows = toQueryRows(sentQuery)
		return { rows, fields: [], rowCount: rows.length }
	}) as unknown as typeof connectionPool.query

	// the stubbed transaction, which runs its callback on the client itself
	db.transaction = ((runTransaction: (transaction: typeof db) => Promise<unknown>) =>
		runTransaction(db)) as unknown as typeof db.transaction
	return sentQueries
}

/**
 * Puts the connection pool's own query and the client's own transaction back.
 */
export function restoreConnectionPool(): void {
	connectionPool.query = originalConnectionPoolQuery
	db.transaction = originalDbTransaction
}

/**
 * Returns a row of the table in its column order, with the given columns filled in and every other column null.
 */
export function toTableRow(table: Table, columnValues: Record<string, unknown>): unknown[] {
	return Object.keys(getTableColumns(table)).map((columnName) => columnValues[columnName] ?? null)
}
