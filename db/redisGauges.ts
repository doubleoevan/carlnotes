// the Redis lines of the minute's gauges: the store's counts, the server's memory, and the warnings they cross
import type { ThresholdCrossing } from "@shared/monitoring"
import type { ExtraGaugesReading } from "@shared/runtimeGauges"
import { readAndResetRedisGauges, runWithRedis } from "./redis"

// how many failed operations in one minute, on a connection that is up, send a warning
const REDIS_ERRORS_ALERT_COUNT = 10

// the share of maxmemory past which a minute sends a warning
const REDIS_MEMORY_ALERT_SHARE = 0.8

// the server's memory use and its limit in bytes, which is zero for a server with no limit
export type RedisMemoryGauges = { usedMemoryBytes: number; maxMemoryBytes: number }

/**
 * Returns the Redis gauges and the server's memory with every threshold they cross, and resets the minute's counts.
 */
export async function readRedisExtraGauges(): Promise<ExtraGaugesReading> {
	// read the server's memory, which connects if nothing has used Redis yet, so an idle process still reports whether
	// the command connection is up. then read the gauges
	const redisMemoryGauges = await readRedisMemoryGauges()
	const redisGauges = readAndResetRedisGauges()

	// cross the Redis-down threshold if the command connection is down, and the errors threshold if a connection that is
	// up rejected commands all minute, which is how a full or write-rejecting server reads
	const thresholdCrossings: ThresholdCrossing[] = []
	if (!redisGauges.isConnected) {
		thresholdCrossings.push({
			condition: "redis-down",
			message: "the redis client is not connected",
			values: { errorCount: redisGauges.errorCount },
		})
	} else if (redisGauges.errorCount >= REDIS_ERRORS_ALERT_COUNT) {
		thresholdCrossings.push({
			condition: "redis-errors",
			message: "redis rejected commands while connected",
			values: { errorCount: redisGauges.errorCount, ...redisMemoryGauges },
		})
	}

	// cross the memory threshold once the server holds most of its limit
	const isMemoryNearLimit =
		redisMemoryGauges !== null &&
		redisMemoryGauges.maxMemoryBytes > 0 &&
		redisMemoryGauges.usedMemoryBytes >= redisMemoryGauges.maxMemoryBytes * REDIS_MEMORY_ALERT_SHARE
	if (isMemoryNearLimit) {
		thresholdCrossings.push({
			condition: "redis-memory",
			message: "redis holds most of its memory limit",
			values: { ...redisMemoryGauges },
		})
	}
	return { gauges: { redis: { ...redisGauges, ...redisMemoryGauges } }, thresholdCrossings }
}

/**
 * Returns the server's memory use and limit from its INFO reply, or null if the read fails.
 */
export async function readRedisMemoryGauges(): Promise<RedisMemoryGauges | null> {
	// read the memory section, and parse the two fields out of its reply
	const infoReply = await runWithRedis("info", (client) => client.send("INFO", ["memory"]))
	if (typeof infoReply !== "string") {
		return null
	}
	return {
		usedMemoryBytes: toInfoNumber(infoReply, "used_memory"),
		maxMemoryBytes: toInfoNumber(infoReply, "maxmemory"),
	}
}

// the number after a field name in an INFO reply, or zero if the field is missing
function toInfoNumber(infoReply: string, fieldName: string): number {
	const fieldMatch = infoReply.match(new RegExp(`^${fieldName}:(\\d+)`, "m"))
	return Number(fieldMatch?.[1] ?? 0)
}
