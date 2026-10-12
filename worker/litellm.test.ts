// LiteLLM tests: the proxy admin calls, the budget read, the spent budget check, and the key created before a first
// model call
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { toTableRow } from "../db/connectionPoolStub"
import { scans } from "../db/schema/scans"
import * as attach from "./attach"
import * as ingest from "./ingest"
import {
	deleteLiteLLMKey,
	isUserLiteLLMKeyBudgetExhausted,
	loadOrProvisionUserLiteLLMKey,
	provisionLiteLLMKey,
	readLiteLLMKeyBudget,
} from "./litellm"
import {
	restoreLiteLLMTest,
	setUpLiteLLMTest,
	stubConnectionPoolInCallOrder,
	stubFailingProxy,
	stubProxy,
	toUserRow,
} from "./litellmTestFixtures"
import { summarizeChunk } from "./workflows/processAttachmentActivities"
import { ingestForScan } from "./workflows/runTopicScanActivities"

// set the proxy settings before each test, and leave the run the way it was found after
beforeEach(setUpLiteLLMTest)
afterEach(restoreLiteLLMTest)

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

// a key that the proxy does not know is already deleted, so the delete returns without an error
test("deleting a key that the proxy does not know returns without an error", async () => {
	const proxyRequests = stubProxy(() => new Response("key not found", { status: 404 }))
	await deleteLiteLLMKey("sk-test")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/delete"])
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
	const sentQueries = stubConnectionPoolInCallOrder(() => [toUserRow("sk-user")])
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
	stubConnectionPoolInCallOrder(() => [toUserRow(null)])
	const proxyRequests = stubProxy(() => Response.json({ info: { spend: 5, max_budget: 3 } }))
	expect(await isUserLiteLLMKeyBudgetExhausted("user-1")).toBe(false)
	expect(proxyRequests).toHaveLength(0)
})

// a stored key is returned without a call to the proxy
test("a stored key is returned without a proxy call", async () => {
	stubConnectionPoolInCallOrder(() => [toUserRow("sk-stored")])
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-stored")
	expect(proxyRequests).toHaveLength(0)
})

// a user with no key has a key created at the user's budget.
// the key and its creation time are stored on the user's row only if that row still has no key
test("a missing key is created at the user's budget and stored with its creation time", async () => {
	// a user with no key, whose conditional update stores the new key
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) =>
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

	// and only if the row still has the role, plan, and budget override that the budget was computed from
	expect(keyUpdate?.text).toContain('"users"."role" = $')
	expect(keyUpdate?.text).toContain('"users"."plan" = $')
	expect(keyUpdate?.text).toContain('"budget_override_cents" is not distinct from $')
	expect(keyUpdate?.values).toEqual(expect.arrayContaining(["sk-new", "user-1", "user", "free", 1234]))
})

// if the user's budget changes while the key is created, the conditional update matches no row.
// the key is deleted, and a second key is created at the new budget
test("a budget that changes while the key is created deletes the created key and creates a key at the new budget", async () => {
	// the first read finds a $12.34 budget override and the second read finds a $50 budget override, both with no key.
	// an update matches the row only if the update names the $50 budget override that the row has now
	const userRows = [toUserRow(null), ["carl@example.com", null, "user", "free", 5000]]
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) => {
		if (!sentQuery.text.startsWith("update")) {
			return userRows.splice(0, 1)
		}
		return sentQuery.values.includes(5000) ? [["user-1"]] : []
	})

	// a proxy that creates a different key for each request
	let createdKeyCount = 0
	const proxyRequests = stubProxy((path) =>
		Response.json(path === "/key/generate" ? { key: `sk-${++createdKeyCount}` } : {}),
	)

	// the first key is deleted, and the second key is created at the new budget and returned
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-2")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual([
		"/key/generate",
		"/key/delete",
		"/key/generate",
	])
	expect(proxyRequests[0]?.body).toMatchObject({ max_budget: 12.34 })
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-1"] })
	expect(proxyRequests[2]?.body).toMatchObject({ max_budget: 50 })

	// the first update names the first key and the old budget override.
	// the second update names the second key and the new budget override
	const keyUpdates = sentQueries.filter((sentQuery) => sentQuery.text.startsWith("update"))
	expect(keyUpdates[0]?.values).toEqual(expect.arrayContaining(["sk-1", 1234]))
	expect(keyUpdates[1]?.values).toEqual(expect.arrayContaining(["sk-2", 5000]))
})

// two first model calls race. the call whose update stored nothing deletes its own key and returns the stored key
test("a lost race deletes the created key and returns the stored key", async () => {
	// the first read finds no key, the conditional update matches no row, and the second read finds the other call's key
	const userRows = [toUserRow(null), toUserRow("sk-stored")]
	stubConnectionPoolInCallOrder((sentQuery) => (sentQuery.text.startsWith("update") ? [] : userRows.splice(0, 1)))
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
	stubConnectionPoolInCallOrder((sentQuery) => (sentQuery.text.startsWith("update") ? [] : userRows.splice(0, 1)))
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
	stubConnectionPoolInCallOrder((sentQuery) => {
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

// an update can store the key and still throw an error. the key that the user's row has is kept and returned
test("an update that stores the key and still throws an error keeps and returns the stored key", async () => {
	// the first read finds no key, the update throws an error, and the second read finds the created key on the row
	const userRows = [toUserRow(null), toUserRow("sk-new")]
	stubConnectionPoolInCallOrder((sentQuery) => {
		if (sentQuery.text.startsWith("update")) {
			throw new Error("connection lost")
		}
		return userRows.splice(0, 1)
	})
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the created key is returned and never deleted
	expect(await loadOrProvisionUserLiteLLMKey("user-1")).toBe("sk-new")
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate"])
})

// a key that the proxy cannot create and a user whose row is gone each throw an error
test("a failed key creation and a missing user each throw an error", async () => {
	// a user with no key and a proxy that cannot create a key
	stubConnectionPoolInCallOrder(() => [toUserRow(null)])
	stubFailingProxy()
	await expect(loadOrProvisionUserLiteLLMKey("user-1")).rejects.toThrow("litellm key/generate failed: 500")

	// a user whose row is gone
	stubConnectionPoolInCallOrder(() => [])
	await expect(loadOrProvisionUserLiteLLMKey("user-1")).rejects.toThrow("user user-1 not found")
})

// the ingest stage creates the owner's missing key before any Source runs.
// a key that the proxy cannot create fails the Scan
test("a Scan whose owner's key cannot be created fails before its Sources run", async () => {
	// a scan row owned by a user with no key
	const scanRow = toTableRow(scans, { ownerId: "user-1" })
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) => {
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
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) => {
		// the attachment names its topic, and the topic names its owner
		if (sentQuery.text.includes('from "attachments"')) {
			return [["topic-1"]]
		}
		return sentQuery.text.includes('from "topics"') ? [["user-1"]] : [toUserRow(null)]
	})
	stubFailingProxy()
	const generateAttachmentContextSpy = spyOn(attach, "generateAttachmentContext")

	// the summary fails for the topic's owner, and no model call ran
	await expect(summarizeChunk("attachment-1", "chunk text")).rejects.toThrow("litellm key/generate failed: 500")
	expect(sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))?.values).toEqual(["user-1"])
	expect(generateAttachmentContextSpy).not.toHaveBeenCalled()

	// an attachment that is gone
	stubConnectionPoolInCallOrder(() => [])
	await expect(summarizeChunk("attachment-1", "chunk text")).rejects.toThrow("attachment attachment-1 not found")
})
