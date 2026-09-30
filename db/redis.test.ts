// Redis store tests over fake clients: null on a failure, the cache, the rate limit window counter, the rate limit slot,
// the gauges, pub/sub, and reconnects
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import {
	cacheJson,
	decrementRateLimitWindow,
	deleteRedisKey,
	incrementRateLimitWindow,
	isWithinRateLimit,
	publishToChannel,
	type RedisConnectionClient,
	readAndResetRedisGauges,
	readRedisExtraGauges,
	readRedisJson,
	replaceRedisJson,
	runWithRedis,
	setRedisClientBuilder,
	subscribeToChannel,
	takeRateLimitSlot,
} from "./redis"

// a channel listener, with the message and channel arguments that Bun's client passes
type ChannelListener = (channelMessage: string, channel: string) => void

// the fake server that every fake client shares: the stored values, when each rate limit slot frees, the clients
// subscribed to each channel, the failures to fake, a connect count, and a gate that holds every subscribe until a test opens it
type FakeRedisServer = {
	storedValueByKey: Map<string, string>
	slotFreesAtByKey: Map<string, number>
	subscribedClientsByChannel: Map<string, Set<FakeRedisClient>>
	// what a test sets and reads: the failures to fake, the connect count, and the subscribe gate
	remainingConnectFailureCount: number
	remainingSubscribeFailureCount: number
	isCommandFailing: boolean
	connectCount: number
	subscribeGate: Promise<void> | null
}

// the real setTimeout, saved before a test replaces it
const originalSetTimeout = globalThis.setTimeout

// a fake client with a connected flag, and a listener registry that survives a dropped connection as in Bun's client
type FakeRedisClient = RedisConnectionClient & {
	listenersByChannel: Map<string, ChannelListener[]>
	connected: boolean
}

// build a fake client on a shared server
function toFakeRedisClient(fakeRedisServer: FakeRedisServer): FakeRedisClient {
	// a failing command throws a socket closed error, as a command on a dead socket does
	const throwIfCommandFailing = (): void => {
		if (fakeRedisServer.isCommandFailing) {
			throw new Error("socket closed")
		}
	}

	// lower a stored count and leave a missing key missing
	const decrementKey = (key: string): number => {
		const storedCount = fakeRedisServer.storedValueByKey.get(key)
		if (storedCount === undefined) {
			return 0
		}
		fakeRedisServer.storedValueByKey.set(key, String(Number(storedCount) - 1))
		return Number(storedCount) - 1
	}

	// take a rate limit slot that no call holds, or return the milliseconds until the slot frees, as the slot script does
	const takeSlot = (key: string, slotMs: number): number => {
		const now = Date.now()
		const slotFreesAt = fakeRedisServer.slotFreesAtByKey.get(key) ?? 0

		// a free slot is held until the slot's length has passed
		if (slotFreesAt <= now) {
			fakeRedisServer.slotFreesAtByKey.set(key, now + slotMs)
			return 0
		}
		return slotFreesAt - now
	}

	// the fake client's state, then the client methods that the store calls
	const fakeRedisClient = {
		listenersByChannel: new Map<string, ChannelListener[]>(),
		connected: false,
		onclose: null,
		// a connect fails while failures are left, then succeeds.
		// a failed connect reports the close before it rejects, as Bun's does
		async connect(): Promise<void> {
			fakeRedisServer.connectCount++
			if (fakeRedisServer.remainingConnectFailureCount > 0) {
				fakeRedisServer.remainingConnectFailureCount--
				fakeRedisClient.onclose?.call(fakeRedisClient as never, new Error("connection refused"))
				throw new Error("connection refused")
			}
			fakeRedisClient.connected = true
		},
		// a close marks the connection down, and the server forgets the client's subscriptions.
		// a connected client reports the close before the close returns, as Bun's does
		close(): void {
			const isConnectedAtClose = fakeRedisClient.connected
			fakeRedisClient.connected = false
			for (const subscribedClients of fakeRedisServer.subscribedClientsByChannel.values()) {
				subscribedClients.delete(fakeRedisClient)
			}

			// report the close of a live connection
			if (isConnectedAtClose) {
				fakeRedisClient.onclose?.call(fakeRedisClient as never, new Error("closed"))
			}
		},
		// a get throws an error while commands are failing and otherwise reads the shared keys
		async get(key: string): Promise<string | null> {
			throwIfCommandFailing()
			return fakeRedisServer.storedValueByKey.get(key) ?? null
		},
		// a set writes the shared keys and ignores the expiry. the XX option writes only a key that exists
		async set(key: string, value: string, ...options: string[]): Promise<"OK" | null> {
			throwIfCommandFailing()
			if (options.includes("XX") && !fakeRedisServer.storedValueByKey.has(key)) {
				return null
			}
			fakeRedisServer.storedValueByKey.set(key, value)
			return "OK"
		},
		// a delete returns 1 if the key was there, and 0 if not
		async del(key: string): Promise<number> {
			throwIfCommandFailing()
			return fakeRedisServer.storedValueByKey.delete(key) ? 1 : 0
		},
		// the increment script returns the count and the time left, which is the whole rate limit window on the first hit.
		// the decrement script lowers only a key that exists
		async send(_command: string, commandArguments: string[]): Promise<unknown> {
			throwIfCommandFailing()
			const [script = "", , key = "", rateLimitWindowMs = "0"] = commandArguments

			// the slot script takes the slot or returns the wait
			if (script.includes("'NX'")) {
				const [, , , slotMs = "0"] = commandArguments
				return takeSlot(key, Number(slotMs))
			}
			if (!script.includes("INCR")) {
				return decrementKey(key)
			}

			// count the hit and return the count with the time left
			const count = Number(fakeRedisServer.storedValueByKey.get(key) ?? "0") + 1
			fakeRedisServer.storedValueByKey.set(key, String(count))
			return [count, count === 1 ? Number(rateLimitWindowMs) : Number(rateLimitWindowMs) - 1]
		},
		// a publish runs every listener that each subscribed client registered for the channel
		async publish(channel: string, channelMessage: string): Promise<number> {
			throwIfCommandFailing()
			const subscribedClients = fakeRedisServer.subscribedClientsByChannel.get(channel) ?? new Set<FakeRedisClient>()

			// a client that registered a listener twice runs the listener twice, as Bun's client does
			for (const subscribedClient of subscribedClients) {
				for (const listener of subscribedClient.listenersByChannel.get(channel) ?? []) {
					listener(channelMessage, channel)
				}
			}
			return subscribedClients.size
		},
		// a subscribe waits at the server's gate, and fails while failures are left
		async subscribe(channel: string, listener: ChannelListener): Promise<number> {
			await fakeRedisServer.subscribeGate
			if (fakeRedisServer.remainingSubscribeFailureCount > 0) {
				fakeRedisServer.remainingSubscribeFailureCount--
				throw new Error("socket closed")
			}

			// add the listener to this client's registry and the client to the server's channel
			fakeRedisClient.listenersByChannel.set(channel, [
				...(fakeRedisClient.listenersByChannel.get(channel) ?? []),
				listener,
			])
			const subscribedClients = fakeRedisServer.subscribedClientsByChannel.get(channel) ?? new Set<FakeRedisClient>()
			subscribedClients.add(fakeRedisClient)
			fakeRedisServer.subscribedClientsByChannel.set(channel, subscribedClients)
			return fakeRedisClient.listenersByChannel.size
		},
	} as unknown as FakeRedisClient
	return fakeRedisClient
}

// drop a client's connection the way a dead socket does. closing a connected client calls the client's onclose
function dropConnection(client: FakeRedisClient): void {
	client.close()
}

// a setTimeout that records each delay and runs the callback after zero milliseconds instead of after the delay.
// the timer's unref returns the timer, as Bun's does
function toInstantSetTimeout(reconnectDelaysMs: number[]): typeof setTimeout {
	return ((callback: () => void, delayMs: number) => {
		reconnectDelaysMs.push(delayMs)
		const instantTimer = originalSetTimeout(callback, 0)
		return { unref: () => instantTimer }
	}) as unknown as typeof setTimeout
}

// wait until a check passes, ten milliseconds at a time, for up to a second
async function waitUntil(isDone: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !isDone(); i++) {
		await Bun.sleep(10)
	}
}

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

// the first hit counts one with the whole rate limit window left, the second counts two, and a failed hit returns null
test("incrementRateLimitWindow counts hits with the rate limit window's reset and returns null while Redis is down", async () => {
	// two hits on one rate limit window
	const firstRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	const secondRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	expect(firstRateLimitWindowHit?.count).toBe(1)
	expect(secondRateLimitWindowHit?.count).toBe(2)
	expect((firstRateLimitWindowHit?.resetAt ?? 0) - Date.now()).toBeGreaterThan(59_000)

	// a hit returns null while commands fail
	fakeRedisServer.isCommandFailing = true
	expect(await incrementRateLimitWindow("w", 60_000)).toBeNull()
})

// a refund lowers an open rate limit window, and a rate limit window that already closed stays closed
test("decrementRateLimitWindow lowers an open rate limit window and leaves a closed rate limit window closed", async () => {
	// two hits, then one refund
	await incrementRateLimitWindow("w", 60_000)
	await incrementRateLimitWindow("w", 60_000)
	await decrementRateLimitWindow("w")
	expect(fakeRedisServer.storedValueByKey.get("w")).toBe("1")

	// a refund on a key whose rate limit window expired creates nothing
	await decrementRateLimitWindow("expired")
	expect(fakeRedisServer.storedValueByKey.has("expired")).toBe(false)
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

// a count at the limit passes, a count past the limit fails, and a hit that Redis could not count passes
test("isWithinRateLimit allows up to the limit and allows a hit that Redis could not count", () => {
	expect(isWithinRateLimit({ count: 10, resetAt: 0 }, 10)).toBe(true)
	expect(isWithinRateLimit({ count: 11, resetAt: 0 }, 10)).toBe(false)
	expect(isWithinRateLimit(null, 10)).toBe(true)
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
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toInstantSetTimeout([]))
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
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toInstantSetTimeout(reconnectDelaysMs))
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
	const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(toInstantSetTimeout(reconnectDelaysMs))
	fakeRedisServer.remainingConnectFailureCount = 7
	await runWithRedis("get", (client) => client.get("k"))
	await waitUntil(() => fakeRedisClients.at(-1)?.connected === true)
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
