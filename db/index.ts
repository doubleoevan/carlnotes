// the app's database client. a pooled Neon connection bound to the domain schema
import { Pool } from "@neondatabase/serverless"
import type { PoolGauges } from "@shared/runtimeGauges"
import { drizzle } from "drizzle-orm/neon-serverless"
import { traceQueries } from "./queryTracing"
import * as schema from "./schema"

// the defaults for the pool's size and for how long a request waits for a connection
const DEFAULT_POOL_MAX = 40
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

// one pooled Neon client for the app. a request that waits past the timeout for a connection fails with an error
export const connectionPool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: toPositiveInteger(process.env.DATABASE_POOL_MAX, DEFAULT_POOL_MAX),
	connectionTimeoutMillis: toPositiveInteger(process.env.DATABASE_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS),
})

// log background pool errors and idle-client failures so an unhandled event never crashes the process
connectionPool.on("error", (error: Error) => console.error("neon pool error", error))

// count and trace each statement a request sends
traceQueries(connectionPool)

// drizzle client bound to the full domain schema. consumers import table definitions from the schema directly
export const db = drizzle(connectionPool, { schema })

/**
 * Returns the pool's counts: its open clients, the idle ones, and the requests waiting for one.
 */
export function readPoolGauges(): PoolGauges {
	return {
		totalCount: connectionPool.totalCount,
		idleCount: connectionPool.idleCount,
		waitingCount: connectionPool.waitingCount,
	}
}

/**
 * Returns an environment value as a whole number above zero,
 * or the default if the value is unset or is not a whole number above zero.
 */
export function toPositiveInteger(value: string | undefined, defaultValue: number): number {
	const parsedNumber = Number(value)
	return Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : defaultValue
}
