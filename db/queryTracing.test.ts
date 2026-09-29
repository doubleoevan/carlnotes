// the per-request query count: each request counts only its own statements, including the ones it waited for a client to send,
// and each statement of a database transaction is counted once.
// a write clears the memo of the request that sent it
import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { Pool } from "@neondatabase/serverless"
import { sql } from "drizzle-orm"
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless"
import { readQueryCount, runWithQueryCount, traceQueries } from "./queryTracing"
import { memoizeInRequest, runWithRequestMemo } from "./requestMemo"

// the result every statement returns, with no database behind the test's clients
const EMPTY_RESULT = { rows: [], fields: [], rowCount: 0, command: "SELECT" }

// a database client that connects at once and returns an empty result a moment after each statement,
// by callback or by promise as the caller asks
class EmptyResultClient extends EventEmitter {
	_queryable = true

	connect(callback: (error?: Error) => void): void {
		setTimeout(() => callback(), 0)
	}

	query(...queryArguments: unknown[]): Promise<typeof EMPTY_RESULT> | undefined {
		// a callback-style query returns its result through the callback
		const callback = queryArguments.at(-1)
		if (typeof callback === "function") {
			setTimeout(() => callback(null, EMPTY_RESULT), 1)
			return undefined
		}
		return new Promise((resolve) => setTimeout(() => resolve(EMPTY_RESULT), 1))
	}

	end(): void {}
}

// a traced pool of one client, so a second request waits for the first one to release it.
// the Neon pool sets its own client class after its constructor runs, so the test's class replaces it on the instance
function createTracedDatabase(): NeonDatabase {
	const pool = Object.assign(new Pool({ max: 1 }), { Client: EmptyResultClient })
	traceQueries(pool)
	return drizzle(pool)
}

// the second request waits for the client the first one is using, and gets it when the first one releases it
test("each request counts only its own statements, and each statement of a transaction once", async () => {
	const database = createTracedDatabase()

	// the first request keeps the only client through a transaction: begin, two selects, and commit
	const firstQueryCount = runWithQueryCount(undefined, async () => {
		await database.transaction(async (transaction) => {
			await transaction.execute(sql`select 1`)
			await Bun.sleep(20)
			await transaction.execute(sql`select 2`)
		})
		return readQueryCount()
	})

	// the second request asks for the client while the first one is using it
	await Bun.sleep(5)
	const secondQueryCount = runWithQueryCount(undefined, async () => {
		await database.execute(sql`select 3`)
		return readQueryCount()
	})
	expect(await firstQueryCount).toBe(4)
	expect(await secondQueryCount).toBe(1)
})

// a statement outside any request waits for the client a request releases, and that request never counts it
test("a statement outside any request is not counted", async () => {
	const database = createTracedDatabase()

	// the request sends one statement and keeps running after its client is released
	const requestQueryCount = runWithQueryCount(undefined, async () => {
		await database.execute(sql`select 1`)
		await Bun.sleep(20)
		return readQueryCount()
	})

	// a statement outside the request still returns its result
	const result = await database.execute(sql`select 2`)
	expect(result.rows).toEqual([])
	expect(await requestQueryCount).toBe(1)
	expect(readQueryCount()).toBe(0)
})

// a select keeps the request's memo, and an update clears it, so only the read after the update reads again
test("a write statement clears the memo of the request that sent it", async () => {
	const database = createTracedDatabase()
	let readCount = 0
	const readUserAccess = async (): Promise<number> => {
		readCount += 1
		return readCount
	}

	// read, select, read, update, read, all inside one request
	await runWithRequestMemo(async () => {
		await memoizeInRequest("user-access:user-1", readUserAccess)
		await database.execute(sql`select 1`)
		await memoizeInRequest("user-access:user-1", readUserAccess)
		await database.execute(sql`update users set plan = 'plus'`)
		await memoizeInRequest("user-access:user-1", readUserAccess)

		// an update inside a with statement clears the memo too
		await database.execute(sql`with changed as (update users set plan = 'free' returning id) select id from changed`)
		await memoizeInRequest("user-access:user-1", readUserAccess)
	})

	// only the first read and the read after each write ran
	expect(readCount).toBe(3)
})
