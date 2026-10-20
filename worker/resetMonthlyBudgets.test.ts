// monthly budget reset tests: the key replacement that the reset runs for each user, the month the reset compares
// a key against, and the reset's concurrency and counts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { startOfUtcMonth } from "../db/quotas"
import { replaceUserLiteLLMKey, resetMonthlyBudgets } from "./litellm"
import {
	restoreLiteLLMTest,
	setUpLiteLLMTest,
	stubCallOrder,
	stubConnectionPoolInCallOrder,
	stubFailingProxy,
	stubProxy,
	toUserRow,
} from "./litellmTestFixtures"

// set the proxy settings before each test, and leave the run the way it was found after
beforeEach(setUpLiteLLMTest)
afterEach(restoreLiteLLMTest)

// a replacement creates the new key at the user's current budget and stores the new key on the user's row.
// the old key is deleted only after the store
test("a key replacement creates the new key at the user's budget, stores the new key, and then deletes the old key", async () => {
	// a user with a stored key and a $12.34 budget override, whose update stores the new key
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) =>
		sentQuery.text.startsWith("update") ? [["user-1"]] : [toUserRow("sk-old")],
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

// a user whose row is deleted while the new key is created has no row to store the key on.
// the new key is deleted, and the old key is kept
test("a key replacement for a user whose row is gone deletes the new key and keeps the old key", async () => {
	// a user with a stored key, whose update matches no row
	stubConnectionPoolInCallOrder((sentQuery) => (sentQuery.text.startsWith("update") ? [] : [toUserRow("sk-old")]))
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))

	// the replacement returns true, and the only key deleted is the new key
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/delete"])
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-new"] })
})

// a user with no key has nothing to replace. a replacement that fails returns false and leaves the old key stored
test("a key replacement does nothing for a user with no key, and returns false if the replacement fails", async () => {
	// a replacement for a user with no key returns true, with no request sent to the proxy
	stubConnectionPoolInCallOrder(() => [toUserRow(null)])
	const proxyRequests = stubProxy(() => Response.json({ key: "sk-new" }))
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)
	expect(proxyRequests).toHaveLength(0)

	// the replacement returns false if the proxy cannot create the new key, and nothing is stored
	const sentQueries = stubConnectionPoolInCallOrder(() => [toUserRow("sk-old")])
	stubFailingProxy()
	expect(await replaceUserLiteLLMKey("user-1")).toBe(false)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)

	// a user with a stored key and an update that fails, and a proxy that creates the new key
	stubConnectionPoolInCallOrder((sentQuery) => {
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
	stubConnectionPoolInCallOrder(() => [["u1"], ["u2"], ["u3"], ["u4"], ["u5"], ["u6"]])

	// a stand-in key replacement that counts how many replacements run at once and fails for u3
	let runningCount = 0
	let peakRunningCount = 0
	const replaceLiteLLMKey = async (userId: string): Promise<boolean> => {
		// raise the running count and its peak, wait a moment, and lower the count
		runningCount++
		peakRunningCount = Math.max(peakRunningCount, runningCount)
		await Bun.sleep(2)
		runningCount--
		return userId !== "u3"
	}

	// five replaced, one failed, and never more than four running
	expect(await resetMonthlyBudgets({ replaceLiteLLMKey })).toEqual({ replacedCount: 5, failedCount: 1 })
	expect(peakRunningCount).toBe(4)
})

// a reset whose claim is lost replaces no further key and rejects
test("a reset whose claim is lost stops before the next replacement", async () => {
	// three due users, and a replacement that loses the claim after the first key
	stubConnectionPoolInCallOrder(() => [["u1"], ["u2"], ["u3"]])
	const claimAbortController = new AbortController()
	const replacedUserIds: string[] = []
	const replaceLiteLLMKey = async (userId: string): Promise<boolean> => {
		replacedUserIds.push(userId)
		claimAbortController.abort(new Error("the monthly-budget-reset claim was lost while its task ran"))
		return true
	}

	// the first replacement loses the claim, so the reset rejects before it replaces every due key
	const resetPromise = resetMonthlyBudgets({ signal: claimAbortController.signal, replaceLiteLLMKey })
	await expect(resetPromise).rejects.toThrow("claim was lost")
	expect(replacedUserIds.length).toBeLessThan(3)
})
