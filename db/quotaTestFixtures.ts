// the connection pool stub that the quota and monthly budget cutoff tests share, which returns an access row and each
// table's spend sum
import { restoreConnectionPool, stubConnectionPool, toSpendSumRows } from "./connectionPoolStub"

// the rows that the spend checks read. the stub picks each row by a pattern in the query's SQL
export type SpendQueryRows = {
	accessRow: unknown[]
	spendDollars: [string, string, string]
}

/**
 * Runs the calls with the connection pool's query swapped for a stub that returns the given spend query rows.
 * The connection pool's own query is put back no matter how the calls end.
 */
export async function withSpendQueryRows<Result>(
	spendQueryRows: SpendQueryRows,
	runCalls: () => Promise<Result>,
): Promise<Result> {
	const [scanDollars, chatDollars, podcastEpisodeDollars] = spendQueryRows.spendDollars
	const spendDollarsByFromClause = {
		'from "scans"': scanDollars,
		'from "chat_turns"': chatDollars,
		'from "episodes"': podcastEpisodeDollars,
	}

	// return one table's spend sum for a sum, and the access row for anything else
	stubConnectionPool(({ text: queryText }) => {
		if (queryText.includes("sum(")) {
			return toSpendSumRows(queryText, spendDollarsByFromClause)
		}
		return [spendQueryRows.accessRow]
	})

	// run the calls, then put the connection pool's own query back
	try {
		return await runCalls()
	} finally {
		restoreConnectionPool()
	}
}
