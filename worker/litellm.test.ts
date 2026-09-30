// litellm tests: a key is created with its budget and no window of its own, the month the reset compares against,
// how many replacements the reset runs at once, and how many the reset counts as failed
import { afterEach, beforeEach, expect, test } from "bun:test"
import { connectionPool } from "../db"
import { startOfUtcMonth } from "../db/quotas"
import { provisionLiteLLMKey, resetMonthlyBudgets } from "./litellm"

// the fetch the proxy call makes and the proxy settings it reads, replaced for a test and restored after it
const originalFetch = globalThis.fetch
const originalBaseUrl = Bun.env.LITELLM_BASE_URL
const originalMasterKey = Bun.env.LITELLM_MASTER_KEY

// the config check needs an address, and the mocked fetch is what responds to it
beforeEach(() => {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
})

// leave the run the way it was found
afterEach(() => {
	globalThis.fetch = originalFetch
	restoreEnv("LITELLM_BASE_URL", originalBaseUrl)
	restoreEnv("LITELLM_MASTER_KEY", originalMasterKey)
})

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
	// keep the body the proxy is sent
	let sentBody: Record<string, unknown> = {}
	globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
		sentBody = JSON.parse(String(init?.body))
		return new Response(JSON.stringify({ key: "sk-test" }), { status: 200 })
	}) as typeof fetch

	expect(await provisionLiteLLMKey("carl@example.com", 300)).toBe("sk-test")
	expect(sentBody.max_budget).toBe(3)
	expect(sentBody.user_id).toBe("carl@example.com")
	expect(sentBody).not.toHaveProperty("budget_duration")
})

// the boundary the due rule compares a key's creation against
test("the month the reset compares a key against begins at utc midnight on the first", () => {
	expect(startOfUtcMonth(new Date("2026-09-19T14:00:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z")
	expect(startOfUtcMonth(new Date("2026-09-30T23:59:59Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z")
	expect(startOfUtcMonth(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
})

// the reset replaces keys four at a time. one user's failed replacement is counted, and the other five keys are replaced
test("the reset runs at most four replacements at once and counts a failure separately", async () => {
	// six due users from a stubbed connection pool query, as the array rows that the driver returns
	const originalConnectionPoolQuery = connectionPool.query
	connectionPool.query = (() =>
		Promise.resolve({
			rows: [["u1"], ["u2"], ["u3"], ["u4"], ["u5"], ["u6"]],
			fields: [],
		})) as unknown as typeof connectionPool.query

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

	// five replaced, one failed, and never more than four in flight.
	// put the connection pool's own query back no matter how the test ends
	try {
		expect(await resetMonthlyBudgets(replaceLiteLLMKey)).toEqual({ replacedCount: 5, failedCount: 1 })
		expect(peakInFlightCount).toBe(4)
	} finally {
		connectionPool.query = originalConnectionPoolQuery
	}
})
