// Redis gauge tests over fake clients: the Redis-down, errors, and memory thresholds, and the server's memory read
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { runWithRedis } from "./redis"
import { type FakeRedisServer, startFakeRedisStore } from "./redisFakeServer"
import { readRedisExtraGauges, readRedisMemoryGauges } from "./redisGauges"

// the fake server that each test's store talks to, and a quiet console
let fakeRedisServer: FakeRedisServer
beforeEach(() => {
	fakeRedisServer = startFakeRedisStore().fakeRedisServer
	spyOn(console, "error").mockImplementation(() => {})
})

// restore every spy after each test, the console included
afterEach(() => {
	mock.restore()
})

// a command connection that cannot connect crosses the Redis-down threshold with the minute's error count
test("readRedisExtraGauges crosses the Redis-down threshold while the command connection cannot connect", async () => {
	fakeRedisServer.remainingConnectFailureCount = 1
	const redisExtraGauges = await readRedisExtraGauges()
	expect(redisExtraGauges.gauges).toEqual({
		redis: { isConnected: false, cacheHitCount: 0, cacheMissCount: 0, errorCount: 1 },
	})
	expect(redisExtraGauges.thresholdCrossings.map((thresholdCrossing) => thresholdCrossing.condition)).toEqual([
		"redis-down",
	])
})

// a connection that is up and failed ten or more commands this minute crosses the errors threshold.
// the server's memory is read too
test("readRedisExtraGauges reads the server's memory and crosses the errors and memory thresholds", async () => {
	// ten failed commands on a live connection, on a server near its memory limit
	fakeRedisServer.infoReply = "# Memory\r\nused_memory:900\r\nmaxmemory:1000\r\n"
	await runWithRedis("get", (client) => client.get("k"))
	fakeRedisServer.isCommandFailing = true
	for (let i = 0; i < 10; i++) {
		await runWithRedis("get", (client) => client.get("k"))
	}
	fakeRedisServer.isCommandFailing = false

	// the gauges include the memory numbers, and both thresholds cross
	const redisExtraGauges = await readRedisExtraGauges()
	expect(redisExtraGauges.gauges).toEqual({
		redis: {
			isConnected: true,
			cacheHitCount: 0,
			cacheMissCount: 0,
			errorCount: 10,
			usedMemoryBytes: 900,
			maxMemoryBytes: 1000,
		},
	})
	expect(redisExtraGauges.thresholdCrossings.map((thresholdCrossing) => thresholdCrossing.condition)).toEqual([
		"redis-errors",
		"redis-memory",
	])
})

// a server with no memory limit crosses no memory threshold, and a failed INFO read leaves the memory numbers out
test("readRedisMemoryGauges reads an unlimited server and returns null when the read fails", async () => {
	fakeRedisServer.infoReply = "# Memory\r\nused_memory:900\r\nmaxmemory:0\r\n"
	expect(await readRedisMemoryGauges()).toEqual({ usedMemoryBytes: 900, maxMemoryBytes: 0 })
	fakeRedisServer.isCommandFailing = true
	expect(await readRedisMemoryGauges()).toBeNull()
})

// a reply that lacks either field is a failed read, never zero memory
test("readRedisMemoryGauges returns null for an incomplete INFO reply", async () => {
	fakeRedisServer.infoReply = "# Memory\r\nused_memory:900\r\n"
	expect(await readRedisMemoryGauges()).toBeNull()
	fakeRedisServer.infoReply = ""
	expect(await readRedisMemoryGauges()).toBeNull()
})
