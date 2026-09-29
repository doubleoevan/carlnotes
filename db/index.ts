// the app's database client. a pooled Neon connection bound to the domain schema
import { Pool } from "@neondatabase/serverless"
import type { PoolGauges } from "@shared/runtimeGauges"
import { drizzle } from "drizzle-orm/neon-serverless"
import { traceQueries } from "./queryTracing"
import * as schema from "./schema"

// one pooled Neon client for the app
export const connectionPool = new Pool({ connectionString: process.env.DATABASE_URL })

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
