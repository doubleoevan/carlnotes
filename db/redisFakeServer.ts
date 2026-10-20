// a fake Redis server for the store's tests: in-memory clients that connect, drop, subscribe, and deliver published
// messages, with the reconnect delays shortened to nothing
import { setRedisClientBuilder } from "./redis"
import type { RedisConnectionClient } from "./redisConnection"

// a channel listener, with the message and channel arguments that Bun's client passes
export type ChannelListener = (channelMessage: string, channel: string) => void

// the fake server that every fake client shares: the stored values, when each rate limit slot frees, the clients
// subscribed to each channel, the failures to fake, a connect count, and a gate that holds every subscribe until a test opens it
export type FakeRedisServer = {
	storedValueByKey: Map<string, string>
	slotFreesAtByKey: Map<string, number>
	subscribedClientsByChannel: Map<string, Set<FakeRedisClient>>
	// what a test sets and reads: the failures to fake, the connect count, and the subscribe gate
	remainingConnectFailureCount: number
	remainingSubscribeFailureCount: number
	isCommandFailing: boolean
	connectCount: number
	subscribeGate: Promise<void> | null
	// whether the server never responds to a command, and the reply it gives to INFO
	isCommandStalled?: boolean
	infoReply?: string
}

// the real setTimeout, saved before a test replaces it
export const originalSetTimeout = globalThis.setTimeout

// a fake client with a connected flag, and a listener registry that survives a dropped connection as in Bun's client
export type FakeRedisClient = RedisConnectionClient & {
	listenersByChannel: Map<string, ChannelListener[]>
	connected: boolean
}

// build a fake client on a shared server
export function toFakeRedisClient(fakeRedisServer: FakeRedisServer): FakeRedisClient {
	// a failing command throws a socket closed error, as a command on a dead socket does
	const throwIfCommandFailing = (): void => {
		if (fakeRedisServer.isCommandFailing) {
			throw new Error("socket closed")
		}
	}

	// a stalled command never settles, as a command sent to a reachable node that stopped replying does
	const stallIfCommandStalled = async (): Promise<void> => {
		if (fakeRedisServer.isCommandStalled) {
			await new Promise<never>(() => {})
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

		// a free slot is taken until the slot's length has passed
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
		// a get throws an error while commands are failing, hangs while commands are stalled, and otherwise reads the shared keys
		async get(key: string): Promise<string | null> {
			throwIfCommandFailing()
			await stallIfCommandStalled()
			return fakeRedisServer.storedValueByKey.get(key) ?? null
		},
		// a set hangs while commands are stalled, then writes the shared keys and ignores the expiry.
		// the XX option writes only a key that exists
		async set(key: string, value: string, ...options: string[]): Promise<"OK" | null> {
			throwIfCommandFailing()
			await stallIfCommandStalled()
			if (options.includes("XX") && !fakeRedisServer.storedValueByKey.has(key)) {
				return null
			}
			fakeRedisServer.storedValueByKey.set(key, value)
			return "OK"
		},
		// a delete hangs while commands are stalled, then returns how many of its keys were there
		async del(...keys: string[]): Promise<number> {
			throwIfCommandFailing()
			await stallIfCommandStalled()
			return keys.filter((key) => fakeRedisServer.storedValueByKey.delete(key)).length
		},
		// the increment script returns the count and the time left, which is the whole rate limit window on the first hit.
		// the decrement script lowers only a key that exists
		async send(command: string, commandArguments: string[]): Promise<unknown> {
			throwIfCommandFailing()
			await stallIfCommandStalled()

			// an INFO command returns the server's reply text
			if (command === "INFO") {
				return fakeRedisServer.infoReply ?? ""
			}
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
		// a publish hangs while commands are stalled, then runs every listener that each subscribed client registered
		// for the channel
		async publish(channel: string, channelMessage: string): Promise<number> {
			throwIfCommandFailing()
			await stallIfCommandStalled()
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
export function dropConnection(client: FakeRedisClient): void {
	client.close()
}

// a setTimeout that runs a reconnect timer's callback after zero milliseconds instead of after its delay, and records
// the delay. a reconnect timer is the one that unrefs itself, so a command's deadline keeps its real delay
export function toInstantReconnectSetTimeout(reconnectDelaysMs: number[]): typeof setTimeout {
	return ((callback: () => void, delayMs: number) => {
		// start a real timer, which runs at its delay unless the caller unrefs it
		const timer = originalSetTimeout(callback, delayMs)

		// an unref that swaps the timer for an instant one and returns that, as Bun's unref returns its timer
		const unrefInstantly = (): ReturnType<typeof setTimeout> => {
			clearTimeout(timer)
			reconnectDelaysMs.push(delayMs)
			return originalSetTimeout(callback, 0)
		}
		return Object.assign(timer, { unref: unrefInstantly })
	}) as unknown as typeof setTimeout
}

// a setTimeout that runs every timer's callback after zero milliseconds, so a command's deadline or a backoff passes at
// once too
export function toEveryTimerInstantSetTimeout(): typeof setTimeout {
	return ((callback: () => void) => originalSetTimeout(callback, 0)) as unknown as typeof setTimeout
}

// wait until a check passes, ten milliseconds at a time, for up to a second
export async function waitUntil(isDone: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !isDone(); i++) {
		await Bun.sleep(10)
	}
}

// a fresh fake server, and the fake clients that the store built on it
export type FakeRedisStore = { fakeRedisServer: FakeRedisServer; fakeRedisClients: FakeRedisClient[] }

/**
 * Builds the store's clients on a fresh fake server with no clients, and returns the server and the clients it builds.
 */
export function startFakeRedisStore(): FakeRedisStore {
	// a fresh server with no clients
	const fakeRedisServer: FakeRedisServer = {
		storedValueByKey: new Map(),
		slotFreesAtByKey: new Map(),
		subscribedClientsByChannel: new Map(),
		remainingConnectFailureCount: 0,
		remainingSubscribeFailureCount: 0,
		isCommandFailing: false,
		connectCount: 0,
		subscribeGate: null,
	}
	const fakeRedisClients: FakeRedisClient[] = []

	// build the store's clients on this fake server, and record each client
	setRedisClientBuilder(() => {
		const client = toFakeRedisClient(fakeRedisServer)
		fakeRedisClients.push(client)
		return client
	})
	return { fakeRedisServer, fakeRedisClients }
}
