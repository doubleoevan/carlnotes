// Redis store tests over fake clients: null on a failure, the cache, the rate limit window counter, the rate limit slot,
// the gauges, pub/sub, and reconnects
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import {
	addSubscriberReconnectListener,
	cacheJson,
	decrementRateLimitWindow,
	deleteRedisKey,
	incrementRateLimitWindow,
	isWithinRateLimit,
	publishToChannel,
	readAndResetRedisGauges,
	readRedisJson,
	replaceRedisJson,
	runWithRedis,
	setRedisClientBuilder,
	subscribeToChannel,
	takeRateLimitSlot,
} from "./redis"
import {
	dropConnection,
	type FakeRedisClient,
	type FakeRedisServer,
	toEveryTimerInstantSetTimeout,
	toFakeRedisClient,
	toInstantReconnectSetTimeout,
	waitUntil,
} from "./redisFakeServer"
import { readRedisExtraGauges, readRedisMemoryGauges } from "./redisGauges"

// the fake server that each test's store talks to, the fake clients that the store built, and a quiet console
let fakeRedisServer: FakeRedisServer
let fakeRedisClients: FakeRedisClient[]
beforeEach(() => {
	// a fresh server with no clients
	fakeRedisServer = {
		storedValueByKey: new Map(),
		slotFreesAtByKey: new Map(),
		subscribedClientsByChannel: new Map(),
		remainingConnectFailureCount: 0,
		remainingSubscribeFailureCount: 0,
		isCommandFailing: false,
		connectCount: 0,
		subscribeGate: null,
	}
	fakeRedisClients = []

	// build the store's clients on this fake server, record each client, and silence the console
	setRedisClientBuilder(() => {
		const client = toFakeRedisClient(fakeRedisServer)
		fakeRedisClients.push(client)
		return client
	})
	spyOn(console, "error").mockImplementation(() => {})
})

// restore every spy after each test, the console included
afterEach(() => {
	mock.restore()
})

// a command that throws an error makes runWithRedis return null and count one error on the gauges
test("a failed command returns null and counts an error", async () => {
	fakeRedisServer.isCommandFailing = true
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(readAndResetRedisGauges()).toEqual({ isConnected: true, cacheHitCount: 0, cacheMissCount: 0, errorCount: 1 })
})

// a failed connect makes runWithRedis return null and count one error, and a call during the backoff returns null without connecting again
test("a failed connect returns null and counts one error, and a call during the backoff returns null without connecting", async () => {
	fakeRedisServer.remainingConnectFailureCount = 5
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(fakeRedisServer.connectCount).toBe(1)
	expect(readAndResetRedisGauges().errorCount).toBe(1)
})

// the cache skips the loader on a hit, loads and stores on a miss, loads again after a delete, and counts each read
test("cacheJson serves a hit, stores a miss, and reloads a deleted key", async () => {
	// a loader that counts its calls
	let loadCount = 0
	const load = async (): Promise<{ count: number }> => ({ count: ++loadCount })

	// the second read returns the first read's value, and a delete makes the third read load again
	expect(await cacheJson({ key: "c", ttlMs: 1000, load })).toEqual({ count: 1 })
	expect(await cacheJson({ key: "c", ttlMs: 1000, load })).toEqual({ count: 1 })
	await deleteRedisKey("c")
	expect(await cacheJson({ key: "c", ttlMs: 1000, load })).toEqual({ count: 2 })
	expect(readAndResetRedisGauges()).toMatchObject({ cacheHitCount: 1, cacheMissCount: 2, errorCount: 0 })
})

// with Redis down every read loads, and nothing counts as a miss
test("cacheJson loads without a cache while Redis is down", async () => {
	// a loader that counts its calls, with every command failing
	fakeRedisServer.isCommandFailing = true
	let loadCount = 0
	const load = async (): Promise<number> => ++loadCount

	// every read loads, and each failed read is an error
	expect(await cacheJson({ key: "c", ttlMs: 1000, load })).toBe(1)
	expect(await cacheJson({ key: "c", ttlMs: 1000, load })).toBe(2)
	expect(readAndResetRedisGauges()).toMatchObject({ cacheHitCount: 0, cacheMissCount: 0, errorCount: 2 })
})

// a stored value that does not parse is a failure. cacheJson loads without storing, and readRedisJson returns null
test("a stored value that does not parse reads as a failure", async () => {
	fakeRedisServer.storedValueByKey.set("broken", "{not json")
	expect(await cacheJson({ key: "broken", ttlMs: 1000, load: async () => "loaded" })).toBe("loaded")
	expect(await readRedisJson("broken")).toBeNull()
	expect(fakeRedisServer.storedValueByKey.get("broken")).toBe("{not json")
	expect(readAndResetRedisGauges()).toMatchObject({ cacheHitCount: 0, cacheMissCount: 0, errorCount: 2 })
})

// a replace rewrites a stored key and leaves a missing key missing
test("replaceRedisJson rewrites a stored key and never creates a missing key", async () => {
	fakeRedisServer.storedValueByKey.set("present", JSON.stringify({ name: "old" }))
	await replaceRedisJson({ key: "present", value: { name: "new" }, ttlMs: 1000 })
	await replaceRedisJson({ key: "missing", value: { name: "new" }, ttlMs: 1000 })
	expect(fakeRedisServer.storedValueByKey.get("present")).toBe(JSON.stringify({ name: "new" }))
	expect(fakeRedisServer.storedValueByKey.has("missing")).toBe(false)
})

// the first hit counts one with the whole rate limit window left, the second counts two, a hit that Redis could not
// count counts in memory under the same key, and the next hit Redis counts reads Redis's count
test("incrementRateLimitWindow counts hits in Redis, in memory while Redis is down, and in Redis again after", async () => {
	// two hits on one rate limit window
	const firstRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	const secondRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	expect(firstRateLimitWindowHit.count).toBe(1)
	expect(secondRateLimitWindowHit.count).toBe(2)
	expect(firstRateLimitWindowHit.resetAt - Date.now()).toBeGreaterThan(59_000)

	// two hits count in memory while commands fail, starting a memory window of their own
	fakeRedisServer.isCommandFailing = true
	const firstMemoryRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	expect(firstMemoryRateLimitWindowHit.count).toBe(1)
	expect(firstMemoryRateLimitWindowHit.resetAt - Date.now()).toBeGreaterThan(59_000)
	expect((await incrementRateLimitWindow("w", 60_000)).count).toBe(2)

	// the next hit Redis counts is Redis's third, with nothing added from memory
	fakeRedisServer.isCommandFailing = false
	expect((await incrementRateLimitWindow("w", 60_000)).count).toBe(3)
})

// a refund lowers an open rate limit window, a rate limit window that already closed stays closed, and a refund
// that Redis could not run lowers the memory window
test("decrementRateLimitWindow lowers an open rate limit window, leaves a closed one closed, and refunds the memory window", async () => {
	// two hits, then one refund
	await incrementRateLimitWindow("w", 60_000)
	await incrementRateLimitWindow("w", 60_000)
	await decrementRateLimitWindow("w")
	expect(fakeRedisServer.storedValueByKey.get("w")).toBe("1")

	// a refund on a key whose rate limit window expired creates nothing
	await decrementRateLimitWindow("expired")
	expect(fakeRedisServer.storedValueByKey.has("expired")).toBe(false)

	// two memory hits and one memory refund leave the next memory hit at two
	fakeRedisServer.isCommandFailing = true
	await incrementRateLimitWindow("m", 60_000)
	await incrementRateLimitWindow("m", 60_000)
	await decrementRateLimitWindow("m")
	expect((await incrementRateLimitWindow("m", 60_000)).count).toBe(2)
})

// one call holds a rate limit slot for its length, the next call waits about that long, and a failed take returns null
test("takeRateLimitSlot takes a free slot, returns the wait while another call holds it, and returns null while Redis is down", async () => {
	// one call takes the slot, and the next has to wait about the slot's whole length
	const rateLimitSlot = { key: "s", slotMs: 60_000 }
	expect(await takeRateLimitSlot(rateLimitSlot)).toBe(0)
	expect(await takeRateLimitSlot(rateLimitSlot)).toBeGreaterThan(59_000)

	// a take returns null while commands fail
	fakeRedisServer.isCommandFailing = true
	expect(await takeRateLimitSlot(rateLimitSlot)).toBeNull()
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

// a count at the limit passes, and a count past the limit fails
test("isWithinRateLimit allows up to the limit", () => {
	expect(isWithinRateLimit({ count: 10, resetAt: 0 }, 10)).toBe(true)
	expect(isWithinRateLimit({ count: 11, resetAt: 0 }, 10)).toBe(false)
})

// a subscriber's handler runs on a publish, a repeat subscribe changes nothing, and a failed publish returns false
test("subscribeToChannel delivers a published message and publishToChannel returns false on a failure", async () => {
	// subscribe, then publish once the subscriber connection is up
	const receivedChannelMessages: string[] = []
	subscribeToChannel("room", (channelMessage) => receivedChannelMessages.push(channelMessage))
	await Bun.sleep(0)
	expect(await publishToChannel({ channel: "room", channelMessage: "hello" })).toBe(true)
	expect(receivedChannelMessages).toEqual(["hello"])

	// a repeat subscribe changes nothing, and a publish returns false while commands fail
	subscribeToChannel("room", () => receivedChannelMessages.push("from a second handler"))
	expect(await publishToChannel({ channel: "room", channelMessage: "again" })).toBe(true)
	expect(receivedChannelMessages).toEqual(["hello", "again"])
	fakeRedisServer.isCommandFailing = true
	expect(await publishToChannel({ channel: "room", channelMessage: "lost" })).toBe(false)
})

// a dropped subscriber connection subscribes every channel again on a fresh client and delivers each message once
test("a dropped subscriber connection resubscribes on a fresh client and delivers each message once", async () => {
	// one subscribed channel on the first subscriber client
	const receivedChannelMessages: string[] = []
	subscribeToChannel("notes", (channelMessage) => receivedChannelMessages.push(channelMessage))
	await Bun.sleep(0)
	const firstSubscriberClient = fakeRedisClients.at(-1) as FakeRedisClient
	expect([...(fakeRedisServer.subscribedClientsByChannel.get("notes") ?? [])]).toEqual([firstSubscriberClient])

	// drop the connection with an instant reconnect timer, and wait for a fresh client to subscribe the channel
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toInstantReconnectSetTimeout([]))
	dropConnection(firstSubscriberClient)
	await waitUntil(
		() => fakeRedisClients.length === 2 && fakeRedisServer.subscribedClientsByChannel.get("notes")?.size === 1,
	)

	// a fresh client subscribed the channel, and one publish reaches the handler once
	const freshSubscriberClient = fakeRedisClients.at(-1) as FakeRedisClient
	expect(freshSubscriberClient).not.toBe(firstSubscriberClient)
	expect([...(fakeRedisServer.subscribedClientsByChannel.get("notes") ?? [])]).toEqual([freshSubscriberClient])
	expect(await publishToChannel({ channel: "notes", channelMessage: "poke" })).toBe(true)
	expect(receivedChannelMessages).toEqual(["poke"])
	setTimeoutSpy.mockRestore()
})

// a subscribe that fails on an open connection starts one reconnect on a fresh client, which subscribes every channel
test("a failed subscribe starts one reconnect and the fresh client subscribes every channel", async () => {
	// one channel on the first subscriber client, then a second channel whose subscribe fails, with an instant timer
	const receivedChannelMessages: string[] = []
	subscribeToChannel("notes", (channelMessage) => receivedChannelMessages.push(`notes ${channelMessage}`))
	await Bun.sleep(0)
	const reconnectDelaysMs: number[] = []
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
		toInstantReconnectSetTimeout(reconnectDelaysMs),
	)
	fakeRedisServer.remainingSubscribeFailureCount = 1
	subscribeToChannel("room", (channelMessage) => receivedChannelMessages.push(`room ${channelMessage}`))
	await waitUntil(() => fakeRedisServer.subscribedClientsByChannel.get("room")?.size === 1)

	// one reconnect built one fresh client, and one failure counted one error
	expect(reconnectDelaysMs).toEqual([1000])
	expect(fakeRedisClients).toHaveLength(2)
	expect(readAndResetRedisGauges().errorCount).toBe(1)

	// the fresh client is subscribed to both channels, and each publish reaches the channel's handler once
	const freshSubscriberClient = fakeRedisClients[1] as FakeRedisClient
	expect([...(fakeRedisServer.subscribedClientsByChannel.get("notes") ?? [])]).toEqual([freshSubscriberClient])
	expect([...(fakeRedisServer.subscribedClientsByChannel.get("room") ?? [])]).toEqual([freshSubscriberClient])
	await publishToChannel({ channel: "notes", channelMessage: "poke" })
	await publishToChannel({ channel: "room", channelMessage: "hello" })
	expect(receivedChannelMessages).toEqual(["notes poke", "room hello"])
	setTimeoutSpy.mockRestore()
})

// the reconnect delay doubles on each failed connect up to thirty seconds and resets once a connect succeeds
test("the reconnect delay doubles to thirty seconds and resets on connect", async () => {
	// seven failed connects with instant timers
	const reconnectDelaysMs: number[] = []
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
		toInstantReconnectSetTimeout(reconnectDelaysMs),
	)
	fakeRedisServer.remainingConnectFailureCount = 7
	await runWithRedis("get", (client) => client.get("k"))
	await waitUntil(() => fakeRedisClients.at(-1)?.connected === true)

	// a command on the fresh connection responds before its deadline, and its deadline timer records no reconnect delay
	fakeRedisServer.storedValueByKey.set("k", "stored")
	expect(await runWithRedis("get", (client) => client.get("k"))).toBe("stored")
	expect(reconnectDelaysMs).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
	expect(fakeRedisClients.at(-1)?.connected).toBe(true)
	expect(readAndResetRedisGauges().errorCount).toBe(7)

	// a later drop starts the backoff over at one second
	dropConnection(fakeRedisClients.at(-1) as FakeRedisClient)
	await waitUntil(() => fakeRedisClients.at(-1)?.connected === true)
	expect(reconnectDelaysMs.at(-1)).toBe(1000)
	setTimeoutSpy.mockRestore()
})

// a channel that registers while the connect is subscribing is subscribed once, and each message arrives once
test("a channel that registers while the subscriber connection connects is subscribed once", async () => {
	// hold every subscribe at the gate, and let the connect reach the gate with the first channel
	let openSubscribeGate = (): void => {}
	fakeRedisServer.subscribeGate = new Promise((resolve) => {
		openSubscribeGate = resolve
	})
	subscribeToChannel("notes", () => {})
	await Bun.sleep(0)

	// register a second channel while the connect waits, then open the gate
	const receivedChannelMessages: string[] = []
	subscribeToChannel("room", (channelMessage) => receivedChannelMessages.push(channelMessage))
	openSubscribeGate()
	await waitUntil(() => fakeRedisServer.subscribedClientsByChannel.get("room")?.size === 1)
	await Bun.sleep(0)

	// the subscriber client holds one listener for the second channel, and one publish arrives once
	const subscriberClient = fakeRedisClients[0] as FakeRedisClient
	expect(subscriberClient.listenersByChannel.get("room")).toHaveLength(1)
	await publishToChannel({ channel: "room", channelMessage: "hello" })
	expect(receivedChannelMessages).toEqual(["hello"])
})

// a reconnect listener runs once each time the subscriber connection comes back and subscribes its channels again,
// and never on the first connect
test("a reconnect listener runs after a drop and not on the first connect", async () => {
	// one listener and one channel, connected for the first time
	let reconnectCount = 0
	addSubscriberReconnectListener(() => {
		reconnectCount++
	})
	subscribeToChannel("notes", () => {})
	await waitUntil(() => fakeRedisServer.subscribedClientsByChannel.get("notes")?.size === 1)
	expect(reconnectCount).toBe(0)

	// a drop with an instant reconnect timer brings a fresh client that subscribes the channel, then the listener runs once
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toInstantReconnectSetTimeout([]))
	dropConnection(fakeRedisClients.at(-1) as FakeRedisClient)
	await waitUntil(() => fakeRedisClients.length === 2 && reconnectCount === 1)
	expect(fakeRedisServer.subscribedClientsByChannel.get("notes")?.size).toBe(1)
	expect(reconnectCount).toBe(1)
	setTimeoutSpy.mockRestore()
})

// a command that never settles returns null at the deadline and counts an error, and three misses in a row replace the client
test("a stalled command returns null at the deadline, and three stalls in a row replace the client", async () => {
	// the deadline and the reconnect wait both fire at once
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toEveryTimerInstantSetTimeout())
	fakeRedisServer.isCommandStalled = true

	// each stalled command returns null and counts one error, and the third miss brings a fresh client
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(fakeRedisClients.length).toBe(1)
	expect(await runWithRedis("get", (client) => client.get("k"))).toBeNull()
	expect(fakeRedisClients.length).toBe(2)
	expect(readAndResetRedisGauges().errorCount).toBe(3)
	setTimeoutSpy.mockRestore()
})

// a connection that is up but rejected commands all minute crosses the errors threshold, and the server's memory is read
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
