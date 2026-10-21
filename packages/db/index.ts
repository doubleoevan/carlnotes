// the app's database client. a pooled Neon connection bound to the domain schema

import { MINIMUM_SHOWN_FINDINGS } from "@carlnotes/contracts/enums"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import type { PoolGauges } from "@carlnotes/server/runtimeGauges"
import { Pool } from "@neondatabase/serverless"
import { and, eq, isNotNull, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-serverless"
import { traceQueries } from "./queryTracing"
import * as billing from "./schema/billing"
import * as chat from "./schema/chat"
import * as claims from "./schema/claims"
import * as columns from "./schema/columns"
import * as invites from "./schema/invites"
import * as notes from "./schema/notes"
import * as podcast from "./schema/podcast"
import * as releases from "./schema/releases"
import * as scans from "./schema/scans"
import * as storage from "./schema/storage"
import * as teams from "./schema/teams"
import * as topics from "./schema/topics"
import * as users from "./schema/users"
import * as vectors from "./schema/vectors"

// the defaults for the pool's size and for how long a request waits for a connection.
// the size is what the pool keeps if the max_connections read fails
const DEFAULT_POOL_MAX = 15
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

// how many processes can hold a pool at once: two api replicas, two worker replicas, the sweep, the budget reset,
// and two more for the replicas a rolling deploy overlaps with and the release jobs. DATABASE_POOL_COUNT overrides it
const DEFAULT_POOL_COUNT = 8

// the share of max_connections that Neon's connection pooler holds on its server side for one user and database
const POOLER_SERVER_SHARE = 0.9

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

// the full domain schema, one object over every schema file, and the drizzle client bound to it
export const schema = {
	...billing,
	...chat,
	...claims,
	...columns,
	...invites,
	...notes,
	...podcast,
	...releases,
	...scans,
	...storage,
	...teams,
	...topics,
	...users,
	...vectors,
}
export const db = drizzle(connectionPool, { schema })

// the client that a db.transaction callback gets, which runs its statements in the transaction
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// the transaction a caller is already inside, or the pool if there is none
export type DbHandle = typeof db | DbTransaction

// a finding is shown unless a user rated the finding thumbs down
export const isFindingShown = sql<boolean>`${schema.findings.rating} is distinct from 'down'`

// a resource that the current embedding model embedded
export const isCurrentModelEmbedding = and(
	isNotNull(schema.resources.embedding),
	eq(schema.resources.embeddingModel, scans.EMBED_MODEL_NAME),
)

// the setting that keeps a transaction's HNSW index scans going past their first candidates, in exact distance order
export const ITERATIVE_INDEX_SCAN_SETTING = "set local hnsw.iterative_scan = strict_order"

/**
 * Returns whether a topic, by its id column or a bound id, has enough Findings that no user rated down to be listed.
 */
export function hasEnoughFindingsToList(topicId: SQLWrapper | string): SQL {
	return sql`(select count(*) from ${schema.findings} where ${schema.findings.topicId} = ${topicId} and ${isFindingShown}) >= ${MINIMUM_SHOWN_FINDINGS}`
}

/**
 * Whether a TopicRow is public and has enough Findings that no user rated down to be listed.
 */
export const isPublicAndShown = and(eq(schema.topics.visibility, "public"), hasEnoughFindingsToList(schema.topics.id))

/**
 * Runs a read in a transaction whose HNSW index scans continue past their first candidates in exact distance order,
 * so filters applied after the index still fill the read's limit.
 */
export async function runWithIterativeIndexScan<Result>(
	runRead: (transaction: DbTransaction) => Promise<Result>,
): Promise<Result> {
	// the setting holds for this transaction alone. neon's connection pooler drops a session setting between transactions
	return db.transaction(async (transaction) => {
		await transaction.execute(sql.raw(ITERATIVE_INDEX_SCAN_SETTING))
		return runRead(transaction)
	})
}

/**
 * Whether an error is Postgres rejecting a duplicate key, checked through each cause that a driver wraps the error in.
 */
export function isUniqueViolation(error: unknown): boolean {
	for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
		if ((cause as { code?: string }).code === "23505") {
			return true
		}
	}
	return false
}

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
 * Sizes the pool from the database: the pooler's share of its max_connections divided by the pool count, unless
 * DATABASE_POOL_MAX sets the size. A failed read keeps the default and reports the failure. Logs the size it sets.
 */
export async function sizeConnectionPool(): Promise<number> {
	// keep a size that configuration sets
	const poolMaxOverride = toPositiveInteger(process.env.DATABASE_POOL_MAX, 0)
	if (poolMaxOverride > 0) {
		connectionPool.options.max = poolMaxOverride
		console.log(`database pool sized to ${poolMaxOverride} connections from DATABASE_POOL_MAX`)
		return poolMaxOverride
	}

	// keep the default without a connection string
	if (!process.env.DATABASE_URL) {
		return DEFAULT_POOL_MAX
	}

	// read max_connections, then size the pool to the pooler's share of it split across the pools that can be open at once
	const poolCount = toPositiveInteger(process.env.DATABASE_POOL_COUNT, DEFAULT_POOL_COUNT)
	try {
		const { rows: maxConnectionsRows } = await connectionPool.query<{ max_connections: string }>("show max_connections")
		const maxConnections = toPositiveInteger(maxConnectionsRows[0]?.max_connections, 0)
		if (maxConnections === 0) {
			throw new Error(`max_connections read as ${maxConnectionsRows[0]?.max_connections}`)
		}

		// set the size for the pool's next checkout and log it
		const poolMax = Math.max(1, Math.floor((POOLER_SERVER_SHARE * maxConnections) / poolCount))
		connectionPool.options.max = poolMax
		console.log(
			`database pool sized to ${poolMax} connections from max_connections ${maxConnections} and ${poolCount} pools`,
		)
		return poolMax
	} catch (error) {
		// keep the default and report the failed read
		console.error(`database pool kept at ${DEFAULT_POOL_MAX} connections: the max_connections read failed`, error)
		reportError(error, "database")
		return DEFAULT_POOL_MAX
	}
}
