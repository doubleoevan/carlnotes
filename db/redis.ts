// the app's Redis store, with one command connection and one subscriber connection. a failed operation returns null
// instead of throwing an error
import { withTimeLimit } from "@shared/time"
import { clearMemoryRateLimitWindows } from "./memoryRateLimitWindows"
import { countCacheRead } from "./queryTracing"
import {
	countError,
	ensureConnected,
	type RedisConnection,
	type RedisConnectionClient,
	readAndResetErrorCount,
	replaceRedisClientBuilder,
	scheduleReconnect,
	stopConnection,
	toConnection,
} from "./redisConnection"

// how long one command may take before the store gives up on it and counts a failure
const COMMAND_TIMEOUT_MS = 2000

// how many commands in a row may miss the deadline before the store replaces the client, which rejects every command
// still queued on the stalled client and starts the reconnect backoff
const COMMAND_TIMEOUTS_BEFORE_RECONNECT = 3

// the deadline misses in a row so far
let consecutiveCommandTimeoutCount = 0

// whether the command connection is up, and the minute's cache hits, cache misses, and failed operations
export type RedisGauges = { isConnected: boolean; cacheHitCount: number; cacheMissCount: number; errorCount: number }

// the error that a command missing its deadline rejects with
class CommandTimeoutError extends Error {
	constructor(operationName: string) {
		super(`redis ${operationName} took over ${COMMAND_TIMEOUT_MS} ms`)
		this.name = "CommandTimeoutError"
	}
}

// the command connection and the subscriber connection, built on first use so importing this module never opens a connection
let commandConnection: RedisConnection | null = null
let subscriberConnection: RedisConnection | null = null

// the minute's cache counts
const minuteGauges = { cacheHitCount: 0, cacheMissCount: 0 }

// the handler that each channel's messages go to
const handlerByChannel = new Map<string, (channelMessage: string) => void>()

// what runs each time the subscriber connection has come back after a drop, and whether it has connected before
const subscriberReconnectListeners = new Set<() => void>()
let hasSubscriberConnected = false

// the channels that each subscriber client has subscribed, so no channel is subscribed twice on one client
const subscribedChannelsByClient = new WeakMap<RedisConnectionClient, Set<string>>()

// a cached read's key, how long a loaded value is stored, how to load the value, and whether a loaded value is stored.
// every loaded value is stored unless isStorable says otherwise
export type CacheJsonOptions<Value> = {
	key: string
	ttlMs: number
	load: () => Promise<Value>
	isStorable?: (loadedValue: Value) => boolean
}

// a JSON value to write under a key for the time to live
export type SaveRedisJsonOptions = { key: string; value: unknown; ttlMs: number }
export type ReplaceRedisJsonOptions = SaveRedisJsonOptions

// one message on one channel, to publish or to deliver
export type PublishToChannelOptions = { channel: string; channelMessage: string }
type DeliverChannelMessageOptions = PublishToChannelOptions

/**
 * Runs one operation on the command connection and returns its result, or null on any failure.
 */
export async function runWithRedis<Result>(
	operationName: string,
	runOperation: (client: RedisConnectionClient) => Promise<Result>,
): Promise<Result | null> {
	// return null if the command connection is down. the failed connection attempt or the closed client already counted the error
	const connection = toCommandConnection()
	if (!(await ensureConnected(connection))) {
		return null
	}

	// run the operation under the command deadline, and clear the deadline misses on a reply
	const commandClient = connection.client
	try {
		const operationResult = await withTimeLimit({
			work: runOperation(commandClient),
			timeLimitMs: COMMAND_TIMEOUT_MS,
			toError: () => new CommandTimeoutError(operationName),
		})
		consecutiveCommandTimeoutCount = 0
		return operationResult
	} catch (error) {
		// count a thrown error, and a missed deadline against the client it ran on if that client is still the current one
		countError(operationName, error)
		if (error instanceof CommandTimeoutError && connection.client === commandClient) {
			countCommandTimeout(connection)
		}
		return null
	}
}

// count a missed deadline, and replace the client once enough commands in a row have missed it.
// closing the stalled client rejects every command still queued on it
function countCommandTimeout(connection: RedisConnection): void {
	consecutiveCommandTimeoutCount++
	if (consecutiveCommandTimeoutCount < COMMAND_TIMEOUTS_BEFORE_RECONNECT) {
		return
	}

	// start over on a fresh client after the backoff
	consecutiveCommandTimeoutCount = 0
	scheduleReconnect(connection)
}

/**
 * Returns the JSON value stored under a key, or loads the value on a miss and stores the value for the time to live,
 * unless isStorable rejects it. A failed read loads the value and stores nothing.
 */
export async function cacheJson<Value>({ key, ttlMs, load, isStorable }: CacheJsonOptions<Value>): Promise<Value> {
	// read the stored value and load without storing if the read fails or the value does not parse
	const cacheRead = await runWithRedis("get", async (client) => {
		const storedJson = await client.get(key)
		return {
			isStored: storedJson !== null,
			storedValue: storedJson === null ? null : (JSON.parse(storedJson) as Value),
		}
	})
	if (cacheRead === null) {
		return load()
	}

	// count a stored value as a hit, for the minute and for the request, and return the stored value
	if (cacheRead.isStored) {
		minuteGauges.cacheHitCount++
		countCacheRead({ isHit: true, key })
		return cacheRead.storedValue as Value
	}

	// count a miss for the minute and for the request, then load and store a storable value for the time to live
	minuteGauges.cacheMissCount++
	countCacheRead({ isHit: false, key })
	const loadedValue = await load()
	if (!isStorable || isStorable(loadedValue)) {
		await saveRedisJson({ key, value: loadedValue, ttlMs })
	}
	return loadedValue
}

/**
 * Returns the JSON value stored under a key, or null if the key is missing, the value does not parse, or the read fails.
 */
export async function readRedisJson<Value>(key: string): Promise<Value | null> {
	// read and parse inside runWithRedis, so a value that does not parse returns null like any failure
	return runWithRedis("get", async (client) => {
		const storedJson = await client.get(key)
		return storedJson === null ? null : (JSON.parse(storedJson) as Value)
	})
}

/**
 * Stores a JSON value under a key for the time to live.
 */
export async function saveRedisJson({ key, value, ttlMs }: SaveRedisJsonOptions): Promise<void> {
	await runWithRedis("set", (client) => client.set(key, JSON.stringify(value), "PX", ttlMs))
}

/**
 * Replaces the JSON value stored under a key for the time to live and writes nothing if the key is gone.
 */
export async function replaceRedisJson({ key, value, ttlMs }: ReplaceRedisJsonOptions): Promise<void> {
	await runWithRedis("set", (client) => client.set(key, JSON.stringify(value), "PX", String(ttlMs), "XX"))
}

/**
 * Deletes one or more keys in one command and returns how many existed, or null if the delete failed.
 */
export async function deleteRedisKeys(...keys: string[]): Promise<number | null> {
	// a delete with no keys has nothing to send
	if (keys.length === 0) {
		return 0
	}
	return runWithRedis("del", (client) => client.del(...keys))
}

/**
 * Publishes one message on a channel and returns whether Redis accepted the message.
 */
export async function publishToChannel({ channel, channelMessage }: PublishToChannelOptions): Promise<boolean> {
	const receiverCount = await runWithRedis("publish", (client) => client.publish(channel, channelMessage))
	return receiverCount !== null
}

/**
 * Delivers a channel's messages to its handler through the process's one subscriber connection.
 * A channel keeps its first handler, and a repeat call changes nothing.
 * An open subscription keeps the process alive.
 */
export function subscribeToChannel(channel: string, onChannelMessage: (channelMessage: string) => void): void {
	// register the channel's first handler, then subscribe the channel
	if (handlerByChannel.has(channel)) {
		return
	}
	handlerByChannel.set(channel, onChannelMessage)
	void subscribeOneChannel(channel)
}

/**
 * Runs a listener each time the subscriber connection has come back after a drop and subscribed every channel again.
 * The first connect runs no listener.
 */
export function addSubscriberReconnectListener(listener: () => void): void {
	subscriberReconnectListeners.add(listener)
}

/**
 * Returns the minute's counts and whether the command connection is up, then resets the counts.
 */
export function readAndResetRedisGauges(): RedisGauges {
	// read the counts, then zero the counts for the next minute
	const redisGauges = {
		isConnected: commandConnection?.client.connected ?? false,
		...minuteGauges,
		errorCount: readAndResetErrorCount(),
	}
	Object.assign(minuteGauges, { cacheHitCount: 0, cacheMissCount: 0 })
	return redisGauges
}

/**
 * Replaces how the store builds its clients, and stops and forgets the connections, the channel handlers, the reconnect
 * listeners, the counts, and the memory rate limit windows.
 */
export function setRedisClientBuilder(nextBuildRedisClient: () => RedisConnectionClient): void {
	// stop the old connections, so a reconnect they were waiting on never builds a client from the new builder
	for (const connection of [commandConnection, subscriberConnection]) {
		if (connection) {
			stopConnection(connection)
		}
	}

	// use the new builder and forget the connections, the channel handlers, and the reconnect listeners
	replaceRedisClientBuilder(nextBuildRedisClient)
	commandConnection = null
	subscriberConnection = null
	handlerByChannel.clear()
	subscriberReconnectListeners.clear()
	hasSubscriberConnected = false

	// forget the counts, the deadline misses, and the memory windows
	readAndResetRedisGauges()
	consecutiveCommandTimeoutCount = 0
	clearMemoryRateLimitWindows()
}

// the command connection, built on first use
function toCommandConnection(): RedisConnection {
	commandConnection ??= toConnection(async () => {})
	return commandConnection
}

// the subscriber connection, built on first use. each fresh client subscribes every registered channel, then the
// reconnect listeners run if the connection has connected before
function toSubscriberConnection(): RedisConnection {
	subscriberConnection ??= toConnection(async (client) => {
		// subscribe every registered channel
		for (const channel of handlerByChannel.keys()) {
			await subscribeOnClient(client, channel)
		}

		// run the reconnect listeners on every connect after the first
		if (hasSubscriberConnected) {
			runSubscriberReconnectListeners()
		}
		hasSubscriberConnected = true
	})
	return subscriberConnection
}

// run each reconnect listener and log one that throws an error
function runSubscriberReconnectListeners(): void {
	for (const listener of subscriberReconnectListeners) {
		// run the listener and log an error it throws
		try {
			listener()
		} catch (error) {
			console.error("redis reconnect listener failed", error)
		}
	}
}

// subscribe one new channel once the subscriber connection is up
async function subscribeOneChannel(channel: string): Promise<void> {
	// return if the subscriber connection cannot connect now. the connection's next successful attempt subscribes the channel
	const connection = toSubscriberConnection()
	if (!(await ensureConnected(connection))) {
		return
	}

	// subscribe the channel unless the connection attempt already subscribed the channel.
	// a failure schedules a reconnect, and the fresh client subscribes every registered channel
	try {
		await subscribeOnClient(connection.client, channel)
	} catch (error) {
		countError("subscribe", error)
		scheduleReconnect(connection)
	}
}

// subscribe a channel on a client at most once. the channel is marked before subscribing, so a concurrent caller skips the channel
async function subscribeOnClient(client: RedisConnectionClient, channel: string): Promise<void> {
	// read or start the client's set of subscribed channels and skip a channel that the set already has
	const subscribedChannels = subscribedChannelsByClient.get(client) ?? new Set<string>()
	subscribedChannelsByClient.set(client, subscribedChannels)
	if (subscribedChannels.has(channel)) {
		return
	}

	// mark the channel, then subscribe the channel
	subscribedChannels.add(channel)
	await client.subscribe(channel, (channelMessage) => deliverChannelMessage({ channel, channelMessage }))
}

// run a channel's handler with a channel message and log an error that the handler throws
function deliverChannelMessage({ channel, channelMessage }: DeliverChannelMessageOptions): void {
	try {
		handlerByChannel.get(channel)?.(channelMessage)
	} catch (error) {
		console.error(`redis handler for ${channel} failed`, error)
	}
}
