// a pool setting read from the environment, the pool size computed from the database at startup, and the WebSocket
// proxy setting
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { neonConfig } from "@neondatabase/serverless"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { configureWebSocketProxy, connectionPool, sizeConnectionPool } from "./index"

// the pool's size and the connection string before a test changes them
const originalPoolMax = connectionPool.options.max
const restoreEnvSettings = saveEnvSettings(["DATABASE_URL", "DATABASE_POOL_MAX", "DATABASE_POOL_COUNT"])

// a connection string for the sizing read, which the stubbed pool never opens
beforeEach(() => {
	process.env.DATABASE_URL = "postgresql://user:password@host/carlnotes"
})

// put the pool, the environment, and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	connectionPool.options.max = originalPoolMax
	mock.restore()
	restoreEnvSettings()
})

// 0.9 times 209 is 188, which split across eight pools is 23
test("the pool is sized from the database's max_connections and the pool count", async () => {
	// a database that reports 209, with the log captured
	stubConnectionPool(() => [{ max_connections: "209" }])
	const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})

	// the size is set on the pool and logged
	expect(await sizeConnectionPool()).toBe(23)
	expect(connectionPool.options.max).toBe(23)
	expect(consoleLogSpy.mock.calls[0]?.[0]).toBe(
		"database pool sized to 23 connections from max_connections 209 and 8 pools",
	)
})

// the pool count setting changes the split, so twelve pools at 901 get 67 each
test("DATABASE_POOL_COUNT changes the split", async () => {
	// twelve pools over a database that reports 901, with the log quiet
	process.env.DATABASE_POOL_COUNT = "12"
	stubConnectionPool(() => [{ max_connections: "901" }])
	spyOn(console, "log").mockImplementation(() => {})
	expect(await sizeConnectionPool()).toBe(67)
})

// an explicit size wins, and the database is not read
test("DATABASE_POOL_MAX wins over the computed size", async () => {
	// a size setting beside a database that reports 901, with the log quiet
	process.env.DATABASE_POOL_MAX = "30"
	const sentQueries = stubConnectionPool(() => [{ max_connections: "901" }])
	spyOn(console, "log").mockImplementation(() => {})

	// the setting is the size, and nothing was read
	expect(await sizeConnectionPool()).toBe(30)
	expect(connectionPool.options.max).toBe(30)
	expect(sentQueries).toHaveLength(0)
})

// a read that throws keeps the default of 15 and reports the failure
test("a failed read keeps the default and reports", async () => {
	// a pool whose every query fails, with the log and the report quiet
	stubConnectionPool(() => {
		throw new Error("connection refused")
	})
	const reportErrorSpy = quietErrorReports()

	// the size stays, and the failure is reported under the database stage
	expect(await sizeConnectionPool()).toBe(15)
	expect(connectionPool.options.max).toBe(originalPoolMax)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "database")
})

// a process with no connection string, such as a test, keeps the default without a read
test("no connection string keeps the default without a read", async () => {
	// no connection string, with every query recorded
	delete process.env.DATABASE_URL
	const sentQueries = stubConnectionPool()

	// the default stays, and nothing was read
	expect(await sizeConnectionPool()).toBe(15)
	expect(sentQueries).toHaveLength(0)
})

// a proxy sends every connection over plain WebSockets with the TLS pipeline off, and no proxy changes nothing
test("configureWebSocketProxy turns off TLS only if a proxy is set", () => {
	// the driver's settings before the test, put back after it
	const originalNeonConfig = {
		wsProxy: neonConfig.wsProxy,
		useSecureWebSocket: neonConfig.useSecureWebSocket,
		pipelineTLS: neonConfig.pipelineTLS,
		pipelineConnect: neonConfig.pipelineConnect,
	}

	try {
		// no proxy keeps Neon's secure defaults
		configureWebSocketProxy(undefined)
		expect(neonConfig.useSecureWebSocket).toBe(originalNeonConfig.useSecureWebSocket)
		expect(neonConfig.wsProxy).toBe(originalNeonConfig.wsProxy)

		// a proxy is used over plain WebSockets, with no TLS and no pipelined startup, and a warning says so
		const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {})
		configureWebSocketProxy("wsproxy:80/v1")
		expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
		expect(neonConfig.wsProxy).toBe("wsproxy:80/v1")
		expect(neonConfig.useSecureWebSocket).toBe(false)
		expect(neonConfig.pipelineTLS).toBe(false)
		expect(neonConfig.pipelineConnect).toBe(false)
	} finally {
		// put the driver's settings back
		Object.assign(neonConfig, originalNeonConfig)
	}
})
