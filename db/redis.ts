// the app's Redis store, with one command connection and one subscriber connection.
// a failed Redis operation returns null instead of throwing an error
import type { ExtraGaugesReading } from "@shared/runtimeGauges"
import { RedisClient } from "bun"

// how long a connection attempt may take, kept short so a request never waits long on an unreachable Redis
const CONNECT_TIMEOUT_MS = 2000

// the reconnect delay doubles on repeated failures and resets once a connection succeeds
const RECONNECT_MINIMUM_MS = 1000
const RECONNECT_MAXIMUM_MS = 30_000

// the shortest time between logged failures, so an outage never floods the log
const ERROR_LOG_INTERVAL_MS = 60_000

// the options for Bun's client, with the client's built-in reconnect and offline queue off.
// the store reconnects without limit, and a command on a down connection fails at once instead of holding up the request
const REDIS_CLIENT_OPTIONS = { connectionTimeout: CONNECT_TIMEOUT_MS, autoReconnect: false, enableOfflineQueue: false }

// a script that atomically increments a key and starts the key's expiry on the rate limit window's first hit.
// the script's reply is the count and the milliseconds left in the rate limit window
const INCREMENT_RATE_LIMIT_WINDOW_SCRIPT = [
	"local count = redis.call('INCR', KEYS[1])",
	"if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
	"return {count, redis.call('PTTL', KEYS[1])}",
].join("\n")

// a script that decrements a key only if the key's rate limit window is still open,
// so a refund never creates a key with no expiry
const DECREMENT_RATE_LIMIT_WINDOW_SCRIPT =
	"if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0"

// the commands that the store sends, and the connection methods and properties that the store uses
type RedisCommandMethod = "get" | "set" | "del" | "send" | "publish"
type RedisConnectionMethod = "connected" | "connect" | "close" | "onclose" | "subscribe"

// the part of Bun's client that the store uses
export type RedisConnectionClient = Pick<RedisClient, RedisCommandMethod | RedisConnectionMethod>

// one hit on a rate limit window, with the count so far and when the rate limit window resets
export type RateLimitWindowHit = { count: number; resetAt: number }

// whether the command connection is up, and the minute's cache hits, cache misses, and failed operations
export type RedisGauges = { isConnected: boolean; cacheHitCount: number; cacheMissCount: number; errorCount: number }

// one connection and its reconnect state. the store holds a command connection and a subscriber connection
type RedisConnection = {
	client: RedisConnectionClient
	connectAttempt: Promise<boolean> | null
	reconnectTimer: ReturnType<typeof setTimeout> | null
	reconnectDelayMs: number
	// what runs each time the client connects. the subscriber connection subscribes every registered channel here
	onConnected: (client: RedisConnectionClient) => Promise<void>
}

// how the store builds a client, replaced by setRedisClientBuilder
let buildRedisClient: () => RedisConnectionClient = () => new RedisClient(Bun.env.REDIS_URL, REDIS_CLIENT_OPTIONS)

// the command connection and the subscriber connection, built on first use so importing this module never opens a connection
let commandConnection: RedisConnection | null = null
let subscriberConnection: RedisConnection | null = null

// the minute's counts, and when a failure was last logged
const minuteGauges = { cacheHitCount: 0, cacheMissCount: 0, errorCount: 0 }
let lastErrorLoggedAt = 0

// the handler that each channel's messages go to
const handlerByChannel = new Map<string, (channelMessage: string) => void>()

// the channels that each subscriber client has subscribed, so no channel is subscribed twice on one client
const subscribedChannelsByClient = new WeakMap<RedisConnectionClient, Set<string>>()

// a cached read's key, how long a loaded value is stored, and how to load the value
export type CacheJsonOptions<Value> = { key: string; ttlMs: number; load: () => Promise<Value> }

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

	// run the operation. count a thrown error and return null
	try {
		return await runOperation(connection.client)
	} catch (error) {
		countError(operationName, error)
		return null
	}
}

/**
 * Returns the JSON value stored under a key, or loads the value on a miss and stores the value for the time to live.
 * A failed read loads the value and stores nothing.
 */
export async function cacheJson<Value>({ key, ttlMs, load }: CacheJsonOptions<Value>): Promise<Value> {
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

	// count a stored value as a hit and return the stored value
	if (cacheRead.isStored) {
		minuteGauges.cacheHitCount++
		return cacheRead.storedValue as Value
	}

	// count a miss, then load and store the value for the time to live
	minuteGauges.cacheMissCount++
	const loadedValue = await load()
	await saveRedisJson({ key, value: loadedValue, ttlMs })
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
 * Deletes a key.
 */
export async function deleteRedisKey(key: string): Promise<void> {
	await runWithRedis("del", (client) => client.del(key))
}

/**
 * Counts one hit on a fixed rate limit window and returns the count and when the rate limit window resets,
 * or null if Redis could not count the hit.
 */
export async function incrementRateLimitWindow(
	key: string,
	rateLimitWindowMs: number,
): Promise<RateLimitWindowHit | null> {
	// run the increment script and return null if the script fails or the script's reply is not two values
	const scriptReply: unknown = await runWithRedis("incrementRateLimitWindow", (client) =>
		client.send("EVAL", [INCREMENT_RATE_LIMIT_WINDOW_SCRIPT, "1", key, String(rateLimitWindowMs)]),
	)
	if (!Array.isArray(scriptReply) || scriptReply.length !== 2) {
		return null
	}

	// return the count and the reset time. the reply's numbers may arrive as integers or big integers
	const [count, ttlMs] = scriptReply.map(Number)
	return { count: count ?? 0, resetAt: Date.now() + Math.max(ttlMs ?? 0, 0) }
}

/**
 * Refunds one hit on a rate limit window that is still open.
 */
export async function decrementRateLimitWindow(key: string): Promise<void> {
	await runWithRedis("decrementRateLimitWindow", (client) =>
		client.send("EVAL", [DECREMENT_RATE_LIMIT_WINDOW_SCRIPT, "1", key]),
	)
}

/**
 * Returns whether a rate limit window's hit is within the limit. A hit that Redis could not count is within the limit.
 */
export function isWithinRateLimit(rateLimitWindowHit: RateLimitWindowHit | null, limit: number): boolean {
	return rateLimitWindowHit === null || rateLimitWindowHit.count <= limit
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
 * Returns the minute's counts and whether the command connection is up, then resets the counts.
 */
export function readAndResetRedisGauges(): RedisGauges {
	// read the counts, then zero the counts for the next minute
	const redisGauges = { isConnected: commandConnection?.client.connected ?? false, ...minuteGauges }
	Object.assign(minuteGauges, { cacheHitCount: 0, cacheMissCount: 0, errorCount: 0 })
	return redisGauges
}

/**
 * Returns the Redis gauges, with a Redis-down threshold crossing if the command connection is down.
 * Reading the gauges resets the minute's counts.
 */
export async function readRedisExtraGauges(): Promise<ExtraGaugesReading> {
	// connect if nothing has used Redis yet, then read the gauges.
	// an idle process still reports whether the command connection is up
	await ensureConnected(toCommandConnection())
	const redisGauges = readAndResetRedisGauges()

	// cross the Redis-down threshold if the command connection is down
	const thresholdCrossings = redisGauges.isConnected
		? []
		: [
				{
					condition: "redis-down",
					message: "the redis client is not connected",
					values: { errorCount: redisGauges.errorCount },
				},
			]
	return { gauges: { redis: redisGauges }, thresholdCrossings }
}

/**
 * Replaces how the store builds its clients and forgets the connections, the channel handlers, and the counts.
 */
export function setRedisClientBuilder(nextBuildRedisClient: () => RedisConnectionClient): void {
	// use the new builder and forget the connections, the channel handlers, and the counts
	buildRedisClient = nextBuildRedisClient
	commandConnection = null
	subscriberConnection = null
	handlerByChannel.clear()
	readAndResetRedisGauges()
}

// the command connection, built on first use
function toCommandConnection(): RedisConnection {
	commandConnection ??= toConnection(async () => {})
	return commandConnection
}

// the subscriber connection, built on first use.
// each time a fresh client connects, the subscriber connection subscribes every registered channel on the fresh client
function toSubscriberConnection(): RedisConnection {
	subscriberConnection ??= toConnection(async (client) => {
		for (const channel of handlerByChannel.keys()) {
			await subscribeOnClient(client, channel)
		}
	})
	return subscriberConnection
}

// a connection on a newly built client, set to reconnect when the client closes
function toConnection(onConnected: RedisConnection["onConnected"]): RedisConnection {
	// the connection starts down, with the shortest delay
	const connection: RedisConnection = {
		client: buildRedisClient(),
		connectAttempt: null,
		reconnectTimer: null,
		reconnectDelayMs: RECONNECT_MINIMUM_MS,
		onConnected,
	}
	reconnectOnClose(connection, connection.client)
	return connection
}

// reconnect when the client closes, unless the connection has already replaced the client
function reconnectOnClose(connection: RedisConnection, client: RedisConnectionClient): void {
	client.onclose = (error) => {
		// ignore the close of a replaced client
		if (connection.client !== client) {
			return
		}

		// count the close and reconnect
		countError("connection", error)
		scheduleReconnect(connection)
	}
}

// connect if the connection is down. a call while a reconnect waits returns false at once instead of waiting for the reconnect
function ensureConnected(connection: RedisConnection): Promise<boolean> {
	// skip the connection attempt if the connection is already up
	if (connection.client.connected) {
		return Promise.resolve(true)
	}

	// return false if a reconnect is waiting after a failure
	if (connection.reconnectTimer) {
		return Promise.resolve(false)
	}

	// start a connection attempt or share the attempt already in flight
	connection.connectAttempt ??= connectNow(connection)
	return connection.connectAttempt
}

// try to connect once. a success runs onConnected and resets the backoff, and a failure schedules a reconnect
async function connectNow(connection: RedisConnection): Promise<boolean> {
	// the client that this attempt connects.
	// bun reports a failed connection attempt as a close first, and the close handler replaces the client
	const connectingClient = connection.client
	try {
		// connect and run onConnected, then reset the backoff.
		// the subscriber connection resets the backoff only once every registered channel is subscribed
		await connectingClient.connect()
		await connection.onConnected(connectingClient)
		connection.reconnectDelayMs = RECONNECT_MINIMUM_MS
		return true
	} catch (error) {
		// count the failure and try again after the backoff, unless a close already replaced the client.
		// a close that replaced the client has already counted the failure and scheduled the reconnect
		if (connection.client === connectingClient) {
			countError("connect", error)
			scheduleReconnect(connection)
		}
		return false
	} finally {
		// clear the finished attempt, whether the attempt succeeded or failed
		connection.connectAttempt = null
	}
}

// schedule a reconnect on a fresh client after the backoff. the timer never keeps the process alive
function scheduleReconnect(connection: RedisConnection): void {
	// skip if a reconnect is already scheduled
	if (connection.reconnectTimer) {
		return
	}

	// swap in a fresh client, then close the old client. bun runs the close handler at once, and the handler ignores a replaced client.
	// bun's client keeps its subscription listeners across a drop, so subscribing again on the same client would run every handler twice
	const replacedClient = connection.client
	connection.client = buildRedisClient()
	reconnectOnClose(connection, connection.client)
	try {
		replacedClient.close()
	} catch {}

	// start a timer that clears itself and connects, then double the next delay up to the limit
	connection.reconnectTimer = setTimeout(() => {
		connection.reconnectTimer = null
		void ensureConnected(connection)
	}, connection.reconnectDelayMs).unref()
	connection.reconnectDelayMs = Math.min(connection.reconnectDelayMs * 2, RECONNECT_MAXIMUM_MS)
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

// count a failed operation and log at most one failure a minute
function countError(operationName: string, error: unknown): void {
	// count the failure and return if a failure was logged less than a minute ago
	minuteGauges.errorCount++
	const now = Date.now()
	if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) {
		return
	}

	// log the failure and save the log time
	lastErrorLoggedAt = now
	console.error(`redis ${operationName} failed`, error)
}
