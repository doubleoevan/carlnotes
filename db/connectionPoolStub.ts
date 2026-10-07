// the connection pool stub that the tests share, and the table row builder for the rows that the stub returns
import { getTableColumns, type Table } from "drizzle-orm"
import { connectionPool } from "./index"

// the connection pool's own query, which restoreConnectionPool puts back
const originalConnectionPoolQuery = connectionPool.query

// a query that the stubbed connection pool was sent: its sql and its values
export type SentQuery = { text: string; values: unknown[] }

/**
 * Swaps the connection pool's query for a stub that returns the rows that toQueryRows picks, and returns each query sent.
 */
export function stubConnectionPool(toQueryRows: (sentQuery: SentQuery) => unknown[] = () => []): SentQuery[] {
	const sentQueries: SentQuery[] = []
	connectionPool.query = (async (queryConfig: string | { text: string }, values: unknown[] = []) => {
		// keep the query, then return its rows. a toQueryRows that throws an error fails that query
		const sentQuery = { text: typeof queryConfig === "string" ? queryConfig : queryConfig.text, values }
		sentQueries.push(sentQuery)
		const rows = toQueryRows(sentQuery)
		return { rows, fields: [], rowCount: rows.length }
	}) as unknown as typeof connectionPool.query
	return sentQueries
}

/**
 * Puts the connection pool's own query back.
 */
export function restoreConnectionPool(): void {
	connectionPool.query = originalConnectionPoolQuery
}

/**
 * Returns a row of the table in its column order, with the given columns filled in and every other column null.
 */
export function toTableRow(table: Table, columnValues: Record<string, unknown>): unknown[] {
	return Object.keys(getTableColumns(table)).map((columnName) => columnValues[columnName] ?? null)
}
