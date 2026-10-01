// LiteLLM tests: the proxy admin calls, the budget read, the spent budget check,
// the key created before a first model call, the key replacement, and the monthly budget reset
import { afterEach, beforeEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { getTableColumns } from "drizzle-orm"
import { connectionPool } from "../db"
import { startOfUtcMonth } from "../db/quotas"
import { scans } from "../db/schema"
import * as attach from "./attach"
import * as ingest from "./ingest"
import {
	deleteLiteLLMKey,
	isUserLiteLLMKeyBudgetExhausted,
	loadOrProvisionUserLiteLLMKey,
	provisionLiteLLMKey,
	readLiteLLMKeyBudget,
	replaceUserLiteLLMKey,
	resetMonthlyBudgets,
} from "./litellm"
import { summarizeChunk } from "./workflows/processAttachmentActivities"
import { ingestForScan } from "./workflows/runTopicScanActivities"

// the real fetch, the connection pool's own query, and the proxy settings, put back after each test
const originalFetch = globalThis.fetch
const originalConnectionPoolQuery = connectionPool.query
const originalBaseUrl = Bun.env.LITELLM_BASE_URL
const originalMasterKey = Bun.env.LITELLM_MASTER_KEY

// set the proxy settings that the config check requires, and empty the stub call order
beforeEach(() => {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	stubCallOrder.length = 0
})

// leave the run the way it was found
afterEach(() => {
	globalThis.fetch = originalFetch
	connectionPool.query = originalConnectionPoolQuery
	restoreEnv("LITELLM_BASE_URL", originalBaseUrl)
	restoreEnv("LITELLM_MASTER_KEY", originalMasterKey)
	mock.restore()
})

// a query that the stubbed connection pool was sent, and a request that the stubbed proxy was sent
type SentQuery = { text: string; values: unknown[] }
type ProxyRequest = { path: string; body: unknown; signal: AbortSignal | null | undefined }

// each stubbed query's first word and each stubbed proxy request's path, in the order that the stubs were called
const stubCallOrder: string[] = []

// swap the connection pool's query for a stub that returns the rows that toQueryRows picks for each query.
// return the queries that the stub is sent. a toQueryRows that throws an error makes that query fail
function stubConnectionPool(toQueryRows: (sentQuery: SentQuery) => unknown[][]): SentQuery[] {
	const sentQueries: SentQuery[] = []
	connectionPool.query = (async (queryConfig: { text: string }, values: unknown[]) => {
		// keep the query and its first word, then return the rows for that query
		const sentQuery = { text: queryConfig.text, values }
		sentQueries.push(sentQuery)
		stubCallOrder.push(queryConfig.text.split(" ")[0] ?? "")
		const rows = toQueryRows(sentQuery)
		return { rows, fields: [], rowCount: rows.length }
	}) as unknown as typeof connectionPool.query
	return sentQueries
}

// swap fetch for a stub proxy that returns the response that toResponse builds for each request's path.
// return the requests that the stub proxy is sent
function stubProxy(toResponse: (path: string) => Response): ProxyRequest[] {
	const proxyRequests: ProxyRequest[] = []
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		// keep the request and its path, then return the response for that path
		const path = new URL(String(input)).pathname
		proxyRequests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal })
		stubCallOrder.push(path)
		return toResponse(path)
	}) as typeof fetch
	return proxyRequests
}

// quiet the console and the error report, and return the spy on the error report
function quietErrorReports(): Mock<typeof monitoring.reportError> {
	spyOn(console, "error").mockImplementation(() => {})
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}

// quiet the console and the error report, and swap fetch for a stub proxy that responds to every request with a 500
function stubFailingProxy(): ProxyRequest[] {
	quietErrorReports()
	return stubProxy(() => new Response("proxy error", { status: 500 }))
}

// a user row that loadLiteLLMKeyOwner selects, with its email, key, role, plan, and a $12.34 budget override
function toUserRow(litellmVirtualKey: string | null): unknown[] {
	return ["carl@example.com", litellmVirtualKey, "user", "free", 1234]
}

// put a setting back, or take it away again when the test run never had it
function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete Bun.env[name]
	} else {
		Bun.env[name] = value
	}
}

// max_budget in dollars, and no budget_duration the proxy would reset on its own
test("a key is created with its budget and no budget_duration", async () => {
	// create a key at a 300 cent budget through a stubbed proxy that returns the key sk-test
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-test" }))
	expect(await provisionLiteLLMKey("carl@example.com", 300)).toBe("sk-test")

	// the body that the proxy was sent
	const sentBody = proxyRequests[0]?.body as Record<string, unknown>
	expect(sentBody.max_budget).toBe(3)
	expect(sentBody.user_id).toBe("carl@example.com")
	expect(sentBody).not.toHaveProperty("budget_duration")
})

// every admin call to the proxy is sent with a five-second timeout signal
test("every proxy admin call is sent with a five-second timeout signal", async () => {
	// a spy on the timeout signal, and a proxy whose response has a key and a budget
	const abortSignalTimeoutSpy = spyOn(AbortSignal, "timeout")
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-test", info: { spend: 1, max_budget: 3 } }))

	// create a key, read its budget, and delete the key
	await provisionLiteLLMKey("carl@example.com", 300)
	await readLiteLLMKeyBudget("sk-test")
	await deleteLiteLLMKey("sk-test")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/info", "/key/delete"])

	// each request has a signal, and each signal was made with a five-second timeout
	expect(proxyRequests.every((proxyRequest) => proxyRequest.signal instanceof AbortSignal)).toBe(true)
	expect(abortSignalTimeoutSpy.mock.calls).toEqual([[5000], [5000], [5000]])
})

// a failed admin call throws an error that names the status and leaves out the proxy's response body
test("a failed admin call throws an error with the status and without the response body", async () => {
	stubFailingProxy()
	await expect(provisionLiteLLMKey("carl@example.com", 300)).rejects.toThrow(/^litellm key\/generate failed: 500$/)
	await expect(deleteLiteLLMKey("sk-test")).rejects.toThrow(/^litellm key\/delete failed: 500$/)
})

// the budget read returns the spend and the maximum budget.
// a key that the proxy does not know, a response with no spend, and a failed request each read as null
test("the budget read parses the spend and the maximum budget, and reads a failure as null", async () => {
	// a key that has spent one dollar of three, and a key with no maximum budget
	stubProxy(() => Response.json({ info: { spend: 1, max_budget: 3 } }))
	expect(await readLiteLLMKeyBudget("sk-test")).toEqual({ spendDollars: 1, maxBudgetDollars: 3 })
	stubProxy(() => Response.json({ info: { spend: 5, max_budget: null } }))
	expect(await readLiteLLMKeyBudget("sk-test")).toEqual({ spendDollars: 5, maxBudgetDollars: null })

	// a key that the proxy does not know, and a response with no spend
	stubProxy(() => new Response("key not found", { status: 404 }))
	expect(await readLiteLLMKeyBudget("sk-test")).toBeNull()
	stubProxy(() => Response.json({ info: {} }))
	expect(await readLiteLLMKeyBudget("sk-test")).toBeNull()

	// a request that throws an error
	globalThis.fetch = (async () => {
		throw new TypeError("fetch failed")
	}) as unknown as typeof fetch
	expect(await readLiteLLMKeyBudget("sk-test")).toBeNull()
})

// a budget is spent at or past its maximum.
// a user with no key, a key with no maximum, and a failed read each count as not spent
test("a budget is spent only at or past its maximum, and never with no key, no maximum, or a failed read", async () => {
	// a user whose key has spent less than, exactly, and more than its three dollar maximum
	const sentQueries = stubConnectionPool(() => [toUserRow("sk-user")])
	for (const [spendDollars, isBudgetExhausted] of [
		[2.99, false],
		[3, true],
		[3.5, true],
	] as const) {
		stubProxy(() => Response.json({ info: { spend: spendDollars, max_budget: 3 } }))
		expect(await isUserLiteLLMKeyBudgetExhausted("user-1")).toBe(isBudgetExhausted)
	}
	expect(sentQueries[0]?.values).toEqual(["user-1"])

	// a key with no maximum budget, and a read that the proxy fails
	stubProxy(() => Response.json({ info: { spend: 5, max_budget: null } }))
	expect(await isUserLiteLLMKeyBudgetExhausted("user-1")).toBe(false)
	stubProxy(() => new Response("proxy error", { status: 500 }))
	expect(await isUserLiteLLMKeyBudgetExhausted("user-1")).toBe(false)

	// a user with no key counts as not spent, with no request sent to the proxy
	stubConnectionPool(() => [toUserRow(null)])
	const proxyRequests = stubProxy(() => Response.json({ info: { spend: 5, max_budget: 3 } }))
	expect(await isUserLiteLLMKeyBudgetExhausted("user-1")).toBe(false)
	expect(proxyRequests).toHaveLength(0)
})

// a stored key is returned without a call to the proxy
test("a stored key is returned without a proxy call", async () => {
	stubConnectionPool(() => [toUserRow("sk-stored")])
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-stored")
	expect(proxyRequests).toHaveLength(0)
})

// a user with no key has a key created at the user's budget.
// the key and its creation time are stored on the user's row only if that row still has no key
test("a missing key is created at the user's budget and stored with its creation time", async () => {
	// a user with no key, whose conditional update stores the new key
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith("update") ? [["user-1"]] : [toUserRow(null)],
	)
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the key is created at the budget override in dollars and returned
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-new")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate"])
	expect(proxyRequests[0]?.body).toMatchObject({ user_id: "carl@example.com", max_budget: 12.34 })

	// the update stores the key and its creation time on that user's row, only if the row still has no key
	const keyUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith("update"))
	expect(keyUpdate?.text).toContain('"litellm_key_created_at"')
	expect(keyUpdate?.text).toContain('"users"."id" = $')
	expect(keyUpdate?.text).toContain('"litellm_virtual_key" is null')
	expect(keyUpdate?.values).toEqual(expect.arrayContaining(["sk-new", "user-1"]))
})

// two first model calls race. the call whose update stored nothing deletes its own key and returns the stored key
test("a lost race deletes the created key and returns the stored key", async () => {
	// the first read finds no key, the conditional update matches no row, and the second read finds the other call's key
	const userRows = [toUserRow(null), toUserRow("sk-stored")]
	stubConnectionPool((sentQuery) => (sentQuery.text.startsWith("update") ? [] : userRows.splice(0, 1)))
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the stored key is returned, and the created key is deleted
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-stored")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/delete"])
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-new"] })
})

// a lost race still returns the stored key if the proxy fails to delete the created key. the failed delete is reported
test("a lost race whose key delete fails still returns the stored key and reports the failure", async () => {
	// the lost race, a spy on the error report, and a proxy that creates the key and fails the delete
	const userRows = [toUserRow(null), toUserRow("sk-stored")]
	stubConnectionPool((sentQuery) => (sentQuery.text.startsWith("update") ? [] : userRows.splice(0, 1)))
	const reportErrorSpy = quietErrorReports()
	stubProxy((path) =>
		path === "/key/generate" ? Response.json({ key: "sk-new" }) : new Response("no", { status: 500 }),
	)

	// the stored key is returned, and the failed delete is reported once
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-stored")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// if the store fails, the created key is deleted from the proxy and the store's error is thrown
test("a failed store deletes the created key and throws the store's error", async () => {
	// a user with no key and an update that fails, and a proxy that creates the key
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith("update")) {
			throw new Error("connection lost")
		}
		return [toUserRow(null)]
	})
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the store's error is thrown, and the created key is deleted
	await expect(loadOrProvisionUserLiteLLMKey("user-1")).rejects.toThrow('Failed query: update "users"')
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/delete"])
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-new"] })
})

// a key that the proxy cannot create and a user whose row is gone each throw an error
test("a failed key creation and a missing user each throw an error", async () => {
	// a user with no key and a proxy that cannot create a key
	stubConnectionPool(() => [toUserRow(null)])
	stubFailingProxy()
	await expect(loadOrProvisionUserLiteLLMKey("user-1")).rejects.toThrow("litellm key/generate failed: 500")

	// a user whose row is gone
	stubConnectionPool(() => [])
	await expect(loadOrProvisionUserLiteLLMKey("user-1")).rejects.toThrow("user user-1 not found")
})

// the ingest stage creates the owner's missing key before any Source runs.
// a key that the proxy cannot create fails the Scan
test("a Scan whose owner's key cannot be created fails before its Sources run", async () => {
	// a scan row owned by a user with no key
	const scanRow = Object.keys(getTableColumns(scans)).map((columnName) => (columnName === "ownerId" ? "user-1" : null))
	const sentQueries = stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('from "scans"')) {
			return [scanRow]
		}
		return sentQuery.text.includes('from "users"') ? [toUserRow(null)] : []
	})

	// a proxy that cannot create a key, and a spy on the Source ingest
	stubFailingProxy()
	const ingestFromTopicSourcesSpy = spyOn(ingest, "ingestFromTopicSources")

	// the ingest stage fails for the Scan's owner, and no Source ran
	await expect(ingestForScan("scan-1", "topic-1")).rejects.toThrow("litellm key/generate failed: 500")
	expect(sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))?.values).toEqual(["user-1"])
	expect(ingestFromTopicSourcesSpy).not.toHaveBeenCalled()
})

// an attachment summary creates the topic owner's missing key before the model call.
// a key that the proxy cannot create fails the summary, and an attachment that is gone throws an error
test("an attachment summary fails before its model call if the owner's key cannot be created, and for a missing attachment", async () => {
	// an attachment whose topic owner has no key, a proxy that cannot create a key, and a spy on the model call
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "attachments"') ? [["user-1"]] : [toUserRow(null)],
	)
	stubFailingProxy()
	const generateAttachmentContextSpy = spyOn(attach, "generateAttachmentContext")

	// the summary fails for the topic's owner, and no model call ran
	await expect(summarizeChunk("attachment-1", "chunk text")).rejects.toThrow("litellm key/generate failed: 500")
	expect(sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))?.values).toEqual(["user-1"])
	expect(generateAttachmentContextSpy).not.toHaveBeenCalled()

	// an attachment that is gone
	stubConnectionPool(() => [])
	await expect(summarizeChunk("attachment-1", "chunk text")).rejects.toThrow("attachment attachment-1 not found")
})

// a replacement creates the new key at the user's current budget and stores the new key on the user's row.
// the old key is deleted only after the store
test("a key replacement creates the new key at the user's budget, stores the new key, and then deletes the old key", async () => {
	// a user with a stored key and a $12.34 budget override
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith("update") ? [] : [toUserRow("sk-old")],
	)
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the new key is created at the override in dollars and stored before the old key is deleted
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)
	expect(stubCallOrder).toEqual(["select", "/key/generate", "update", "/key/delete"])
	expect(proxyRequests[0]?.body).toMatchObject({ max_budget: 12.34 })
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-old"] })

	// the update stores the new key on that user's row
	const keyUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith("update"))
	expect(keyUpdate?.values).toEqual(expect.arrayContaining(["sk-new", "user-1"]))
})

// a user with no key has nothing to replace. a replacement that fails returns false and leaves the old key stored
test("a key replacement does nothing for a user with no key, and returns false if the replacement fails", async () => {
	// a replacement for a user with no key returns true, with no request sent to the proxy
	stubConnectionPool(() => [toUserRow(null)])
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)
	expect(proxyRequests).toHaveLength(0)

	// the replacement returns false if the proxy cannot create the new key, and nothing is stored
	const sentQueries = stubConnectionPool(() => [toUserRow("sk-old")])
	stubFailingProxy()
	expect(await replaceUserLiteLLMKey("user-1")).toBe(false)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)

	// a user with a stored key and an update that fails, and a proxy that creates the new key
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith("update")) {
			throw new Error("connection lost")
		}
		return [toUserRow("sk-old")]
	})
	const failedStoreProxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the replacement returns false. the new key is created and then deleted, and the old key is kept
	expect(await replaceUserLiteLLMKey("user-1")).toBe(false)
	expect(failedStoreProxyRequests.map((proxyRequest) => proxyRequest.body)).toEqual([
		expect.objectContaining({ max_budget: 12.34 }),
		{ keys: ["sk-new"] },
	])
})

// the boundary the due rule compares a key's creation against
test("the month the reset compares a key against begins at utc midnight on the first", () => {
	expect(startOfUtcMonth(new Date("2026-09-19T14:00:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z")
	expect(startOfUtcMonth(new Date("2026-09-30T23:59:59Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z")
	expect(startOfUtcMonth(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
})

// the reset replaces keys four at a time. one user's failed replacement is counted, and the other five keys are replaced
test("the reset runs at most four replacements at once and counts a failure separately", async () => {
	// six due users from the stubbed connection pool, as the array rows that the driver returns
	stubConnectionPool(() => [["u1"], ["u2"], ["u3"], ["u4"], ["u5"], ["u6"]])

	// a stand-in key replacement that counts how many replacements run at once and fails for u3
	let inFlightCount = 0
	let peakInFlightCount = 0
	const replaceLiteLLMKey = async (userId: string): Promise<boolean> => {
		// raise the in-flight count and its peak, wait a moment, and lower the count
		inFlightCount++
		peakInFlightCount = Math.max(peakInFlightCount, inFlightCount)
		await Bun.sleep(2)
		inFlightCount--
		return userId !== "u3"
	}

	// five replaced, one failed, and never more than four in flight
	expect(await resetMonthlyBudgets(replaceLiteLLMKey)).toEqual({ replacedCount: 5, failedCount: 1 })
	expect(peakInFlightCount).toBe(4)
})
