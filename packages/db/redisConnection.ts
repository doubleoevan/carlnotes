// one Redis connection and its reconnects: the client options, the connect with its backoff, the reconnect on a drop,
// and the failed operation count
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
export const REDIS_CLIENT_OPTIONS = {
	connectionTimeout: CONNECT_TIMEOUT_MS,
	autoReconnect: false,
	enableOfflineQueue: false,
}

// the commands that the store sends, and the connection methods and properties that the store uses
type RedisCommandMethod = "get" | "set" | "del" | "send" | "publish"

type RedisConnectionMethod = "connected" | "connect" | "close" | "onclose" | "subscribe"

// the part of Bun's client that the store uses
export type RedisConnectionClient = Pick<RedisClient, RedisCommandMethod | RedisConnectionMethod>

// one connection and its reconnect state. the store holds a command connection and a subscriber connection
export type RedisConnection = {
	client: RedisConnectionClient
	connectAttempt: Promise<boolean> | null
	reconnectTimer: ReturnType<typeof setTimeout> | null
	reconnectDelayMs: number
	// set once the store forgets the connection, so it never reconnects again
	isStopped: boolean
	// what runs each time the client connects. the subscriber connection subscribes every registered channel here
	onConnected: (client: RedisConnectionClient) => Promise<void>
}

// how the store builds a client, replaced by setRedisClientBuilder
let buildRedisClient: () => RedisConnectionClient = () => new RedisClient(Bun.env.REDIS_URL, REDIS_CLIENT_OPTIONS)

/**
 * Replaces how the connections build their clients.
 */
export function replaceRedisClientBuilder(nextBuildRedisClient: () => RedisConnectionClient): void {
	buildRedisClient = nextBuildRedisClient
}

/**
 * Returns the minute's failed operation count, then resets it.
 */
export function readAndResetErrorCount(): number {
	const count = errorCount
	errorCount = 0
	return count
}

// the minute's failed operations, and when a failure was last logged
let errorCount = 0

let lastErrorLoggedAt = 0

/**
 * Returns a connection on a newly built client, set to reconnect when the client closes.
 */
export function toConnection(onConnected: RedisConnection["onConnected"]): RedisConnection {
	// the connection starts down, with the shortest delay
	const connection: RedisConnection = {
		client: buildRedisClient(),
		connectAttempt: null,
		reconnectTimer: null,
		reconnectDelayMs: RECONNECT_MINIMUM_MS,
		isStopped: false,
		onConnected,
	}
	reconnectOnClose(connection, connection.client)
	return connection
}

// reconnect when the client closes, unless the connection has already replaced the client
function reconnectOnClose(connection: RedisConnection, client: RedisConnectionClient): void {
	client.onclose = (error) => {
		// ignore the close of a replaced client or of a stopped connection
		if (connection.client !== client || connection.isStopped) {
			return
		}

		// count the close and reconnect
		countError("connection", error)
		scheduleReconnect(connection)
	}
}

/**
 * Connects if the connection is down. A call while a reconnect waits returns false at once.
 */
export function ensureConnected(connection: RedisConnection): Promise<boolean> {
	// skip the connection attempt if the connection is already up
	if (connection.client.connected) {
		return Promise.resolve(true)
	}

	// return false if a reconnect is waiting after a failure
	if (connection.reconnectTimer) {
		return Promise.resolve(false)
	}

	// start a connection attempt or share the attempt already in progress
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

/**
 * Schedules a reconnect on a fresh client after the backoff. The timer never keeps the process alive.
 */
export function scheduleReconnect(connection: RedisConnection): void {
	// skip if a reconnect is already scheduled or the connection is stopped
	if (connection.reconnectTimer || connection.isStopped) {
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

/**
 * Stops a connection for good: the reconnect it waits on is cancelled, a later close or failed connect schedules none,
 * and its client is closed.
 */
export function stopConnection(connection: RedisConnection): void {
	// mark the connection stopped and cancel the reconnect it waits on
	connection.isStopped = true
	if (connection.reconnectTimer) {
		clearTimeout(connection.reconnectTimer)
		connection.reconnectTimer = null
	}

	// close the client, whose close handler now does nothing
	try {
		connection.client.close()
	} catch {}
}

/**
 * Counts a failed operation and logs at most one failure a minute.
 */
export function countError(operationName: string, error: unknown): void {
	// count the failure and return if a failure was logged less than a minute ago
	errorCount++
	const now = Date.now()
	if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) {
		return
	}

	// log the failure and save the log time
	lastErrorLoggedAt = now
	console.error(`redis ${operationName} failed`, error)
}
