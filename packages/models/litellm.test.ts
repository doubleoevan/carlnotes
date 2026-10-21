// LiteLLM key replacement tests: the replacement stores its key over the key it read alone, and a replacement that
// another one beat deletes its own key
import { afterEach, beforeEach, expect, test } from "bun:test"
import { replaceUserLiteLLMKey } from "./litellm"
import {
	restoreLiteLLMTest,
	setUpLiteLLMTest,
	stubConnectionPoolInCallOrder,
	stubProxy,
	toUserRow,
} from "./litellmTestFixtures"

// set the proxy settings before each test, and leave the run the way it was found after
beforeEach(setUpLiteLLMTest)
afterEach(restoreLiteLLMTest)

// a proxy that creates sk-new, accepts every delete, and reports the stored key at the user's budget
function stubReplacementProxy(): ReturnType<typeof stubProxy> {
	return stubProxy((path) =>
		Response.json(
			path === "/key/generate"
				? { key: "sk-new" }
				: path.startsWith("/key/info")
					? { info: { spend: 0, max_budget: 12.34 } }
					: {},
		),
	)
}

// the store names the user and the key that was read, so a row whose key another replacement moved on is left alone
test("a replacement stores the new key over the key it read, then retires that key", async () => {
	// a user on sk-old, whose row still has that key at the store
	const sentQueries = stubConnectionPoolInCallOrder((sentQuery) =>
		sentQuery.text.startsWith("update") ? [["user-1"]] : [toUserRow("sk-old")],
	)
	const proxyRequests = stubReplacementProxy()
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)

	// the update stores the new key on the row that has the user's id and the old key
	const keyUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith("update"))
	expect(keyUpdate?.text).toContain('"users"."id" = $')
	expect(keyUpdate?.text).toContain('"users"."litellm_virtual_key" = $')
	expect(keyUpdate?.values).toEqual(expect.arrayContaining(["sk-new", "user-1", "sk-old"]))

	// the old key is retired once the new one is stored
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/delete"])
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-old"] })
})

// two replacements of one user overlap. the one whose store matched no row deletes the key it created, keeps the
// stored key, and reads as done once the stored key's budget is the user's
test("a replacement that another one beat deletes its own key and leaves the stored key", async () => {
	// a user on sk-old, whose row no longer has that key at the store
	stubConnectionPoolInCallOrder((sentQuery) => (sentQuery.text.startsWith("update") ? [] : [toUserRow("sk-old")]))
	const proxyRequests = stubReplacementProxy()
	expect(await replaceUserLiteLLMKey("user-1")).toBe(true)

	// the created key is deleted, the old key is never retired, and the stored key's budget is read
	expect(proxyRequests.map((proxyRequest) => proxyRequest.path)).toEqual(["/key/generate", "/key/delete", "/key/info"])
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-new"] })
})

// a budget that changed between the read and the store sizes the new key wrong, so the store matches no row and the
// stale key reads as not replaced
test("a replacement sized before a budget change stores nothing and reads as not replaced", async () => {
	// the row's plan moved on, so the update matches no row, and the proxy knows no budget for the stored key
	stubConnectionPoolInCallOrder((sentQuery) => (sentQuery.text.startsWith("update") ? [] : [toUserRow("sk-old")]))
	const proxyRequests = stubProxy((path) => Response.json(path === "/key/generate" ? { key: "sk-new" } : {}))
	expect(await replaceUserLiteLLMKey("user-1")).toBe(false)

	// the created key is deleted, and the store names the plan and the override the key was sized from
	expect(proxyRequests[1]?.body).toEqual({ keys: ["sk-new"] })
})
