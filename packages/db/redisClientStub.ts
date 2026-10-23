// the Redis client stub that the tests share: in-memory clients over one map of stored values
import { RedisClient } from "bun"
import { setRedisClientBuilder } from "./redis"
import { REDIS_CLIENT_OPTIONS, type RedisConnectionClient } from "./redisConnection"
import { runFakeSpendReservationCommand } from "./redisFakeSpendReservations"
import { readFakeBuffer, runFakeViewerCountCommand, toFakeStoredValue } from "./redisFakeViewerCounts"

/**
 * Swaps the store's clients for in-memory fakes that share one map of stored values, and returns the map.
 */
export function stubRedisClient(): Map<string, string> {
	// build every client over one shared map
	const storedValueByKey = new Map<string, string>()
	setRedisClientBuilder(() => toFakeRedisClient(storedValueByKey))
	return storedValueByKey
}

/**
 * Swaps the store's clients for ones that never connect, so every operation fails as it does while Redis is down.
 */
export function stubUnreachableRedisClient(): void {
	setRedisClientBuilder(
		() =>
			({
				connected: false,
				onclose: null,
				connect: async () => {
					throw new Error("connection refused")
				},
				close: () => {},
			}) as unknown as RedisConnectionClient,
	)
}

/**
 * Puts the store's own client builder back.
 */
export function restoreRedisClient(): void {
	setRedisClientBuilder(() => new RedisClient(Bun.env.REDIS_URL, REDIS_CLIENT_OPTIONS))
}

// a fake client over the shared map. the reads, the writes, the viewer count and spend reservation commands, and the
// scripts run on the map, and pub/sub delivers nothing
function toFakeRedisClient(storedValueByKey: Map<string, string>): RedisConnectionClient {
	const fakeRedisClient = {
		connected: false,
		onclose: null,
		async connect(): Promise<void> {
			fakeRedisClient.connected = true
		},
		close(): void {
			fakeRedisClient.connected = false
		},
		async get(key: string): Promise<string | null> {
			return storedValueByKey.get(key) ?? null
		},
		// read a key and delete it
		async getdel(key: string): Promise<string | null> {
			const storedValue = storedValueByKey.get(key) ?? null
			storedValueByKey.delete(key)
			return storedValue
		},
		// read a stored counter as bytes
		async getBuffer(key: string): Promise<Uint8Array | null> {
			return readFakeBuffer(storedValueByKey, key)
		},
		// the XX option writes only a key that exists, and the expiry options are ignored
		async set(key: string, value: string | Uint8Array, ...options: string[]): Promise<"OK" | null> {
			if (options.includes("XX") && !storedValueByKey.has(key)) {
				return null
			}
			storedValueByKey.set(key, toFakeStoredValue(value))
			return "OK"
		},
		// count the keys that existed
		async del(...keys: string[]): Promise<number> {
			return keys.filter((key) => storedValueByKey.delete(key)).length
		},
		// tell the scripts apart by their text, after the viewer count commands
		async send(command: string, commandArguments: string[]): Promise<unknown> {
			const viewerCountReply = runFakeViewerCountCommand(storedValueByKey, command, commandArguments)
			if (viewerCountReply !== undefined) {
				return viewerCountReply
			}

			// a spend reservation command runs on the map
			const spendReservationReply = runFakeSpendReservationCommand(storedValueByKey, command, commandArguments)
			if (spendReservationReply !== undefined) {
				return spendReservationReply
			}

			// the slot script always takes the slot
			const [script = "", , key = "", rateLimitWindowMs = "0"] = commandArguments
			if (script.includes("'NX'")) {
				return 0
			}

			// the decrement script lowers the key, and the increment script counts it
			if (!script.includes("INCR")) {
				return decrementKey(storedValueByKey, key)
			}
			return incrementKey(storedValueByKey, key, Number(rateLimitWindowMs))
		},
		async publish(): Promise<number> {
			return 0
		},
		async subscribe(): Promise<number> {
			return 0
		},
	}
	return fakeRedisClient as unknown as RedisConnectionClient
}

// count one hit on a key and return the count with the window's time left
function incrementKey(storedValueByKey: Map<string, string>, key: string, rateLimitWindowMs: number): [number, number] {
	const count = Number(storedValueByKey.get(key) ?? "0") + 1
	storedValueByKey.set(key, String(count))
	return [count, rateLimitWindowMs]
}

// lower a key that exists and leave a missing key missing
function decrementKey(storedValueByKey: Map<string, string>, key: string): number {
	const storedCount = storedValueByKey.get(key)
	if (storedCount === undefined) {
		return 0
	}
	storedValueByKey.set(key, String(Number(storedCount) - 1))
	return Number(storedCount) - 1
}
