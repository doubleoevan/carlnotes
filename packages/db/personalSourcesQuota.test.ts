// database-clock boundaries apply the common send ceiling without changing plan capabilities
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { readPersonalSourcesAllowance } from "./personalSourcesQuota"

// every fixture restores the real pool before the next module uses it
afterEach(restoreConnectionPool)

test("a shared 200th receipt exhausts the day and the UTC reset starts a fresh allowance", async () => {
	// the database returns its clock and the sum of the persisted origin rows
	let now = "2026-11-03T23:59:59.999Z"
	let acceptedCount = "199"
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [[now]] : [[acceptedCount]]))
	expect(await readPersonalSourcesAllowance({ userId: "sender" })).toMatchObject({
		isAvailable: true,
		day: "2026-11-03",
		resetAt: "2026-11-04T00:00:00.000Z",
	})

	// an exhausted day remains exhausted even if older counters exceed the new ceiling
	acceptedCount = "200"
	expect((await readPersonalSourcesAllowance({ userId: "sender" })).isAvailable).toBe(false)
	acceptedCount = "250"
	expect((await readPersonalSourcesAllowance({ userId: "sender" })).isAvailable).toBe(false)

	// midnight reads the next day's rows instead of refunding or deleting yesterday's history
	now = "2026-11-04T00:00:00.000Z"
	acceptedCount = "0"
	expect(await readPersonalSourcesAllowance({ userId: "sender" })).toMatchObject({
		isAvailable: true,
		day: "2026-11-04",
		resetAt: "2026-11-05T00:00:00.000Z",
	})
})
