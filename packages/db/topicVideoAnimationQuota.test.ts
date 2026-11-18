// Exercise monthly admission through the same Drizzle queries as the film worker.
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { reserveTopicVideoAnimation } from "./topicVideoAnimationQuota"

afterEach(restoreConnectionPool)

for (const [plan, limit] of [
	["free", 1],
	["plus", 3],
	["premium", 7],
] as const) {
	test(`${plan} reserves its last monthly shot and refuses another`, async () => {
		// Start with one slot left. The inserted reservation counts even before the renderer finishes.
		let slots = limit - 1
		const queries = stubConnectionPool(({ text }) => {
			if (text.includes('from "users"')) {
				return [[plan]]
			}
			if (text.includes("count(")) {
				return [[slots]]
			}
			if (text.startsWith("insert")) {
				slots++
				return [["reservation"]]
			}
			return []
		})
		expect(await reserveTopicVideoAnimation("owner", "episode", "last")).toEqual({
			kind: "reserved",
			id: "reservation",
			platformPays: plan === "free",
		})
		expect(await reserveTopicVideoAnimation("owner", "another-episode", "extra")).toEqual({ kind: "full" })
		expect(queries[0]?.text).toContain('for update of "users"')
	})
}

test("reuses another film's exact picture before checking the monthly limit", async () => {
	// The lookup is scoped to the current account and calendar month.
	const queries = stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["free"]] : [["original"]]))
	expect(await reserveTopicVideoAnimation("owner", "new-episode", "picture")).toEqual({
		kind: "reuse",
		episodeId: "original",
	})
	expect(queries).toHaveLength(2)
	expect(queries[1]?.values).toContain("owner")
	expect(queries[1]?.values).toContain("picture")
})

test("a missing owner or a removed origin cannot generate a second animation", async () => {
	stubConnectionPool()
	await expect(reserveTopicVideoAnimation("different-owner", "episode", "picture")).rejects.toThrow(
		"Missing film owner",
	)
	restoreConnectionPool()
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["free"]] : [[null]]))
	expect(await reserveTopicVideoAnimation("owner", "episode", "picture")).toEqual({ kind: "full" })
})
