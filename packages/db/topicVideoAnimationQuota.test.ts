// Exercise monthly admission through the same Drizzle queries as the film worker.
import { afterEach, expect, test } from "bun:test"
import type { Plan } from "@carlnotes/contracts/plans"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "./connectionPoolStub"
import { releaseTopicVideoAnimation, reserveTopicVideoAnimation } from "./topicVideoAnimationQuota"

afterEach(restoreConnectionPool)

for (const [plan, limit] of [
	["free", 1],
	["plus", 3],
	["premium", 7],
] as const) {
	test(`${plan} reserves its last monthly shot and refuses another`, async () => {
		// Start with one slot left. The inserted reservation counts even before the renderer finishes.
		const queries = stubAnimationReservations(plan, "user", limit - 1)
		expect(await reserveTopicVideoAnimation("owner", "episode", "last")).toEqual({
			kind: "reserved",
			id: "reservation-1",
			platformPays: plan === "free",
		})
		expect(await reserveTopicVideoAnimation("owner", "another-episode", "extra")).toEqual({ kind: "full" })
		expect(queries[0]?.text).toContain('for update of "users"')
	})
	test(`an admin on ${plan} keeps reserving past the monthly plan limit`, async () => {
		// Crossing the boundary keeps the first Free shot subsidized and bills any extra shots to the owner.
		const queries = stubAnimationReservations(plan, "admin", limit - 1)
		expect(await reserveTopicVideoAnimation("owner", "episode", "last")).toEqual({
			kind: "reserved",
			id: "reservation-1",
			platformPays: plan === "free",
		})
		expect(await reserveTopicVideoAnimation("owner", "another-episode", "extra")).toEqual({
			kind: "reserved",
			id: "reservation-2",
			platformPays: false,
		})
		expect(queries[0]?.text).toContain('"role"')
	})
}

test("releasing a Free admin’s included shot restores the subsidy after another film reserved an extra", async () => {
	// The first film is still preparing its picture when the second one submits on the owner's key.
	stubAnimationReservations("free", "admin", 0)
	const first = await reserveTopicVideoAnimation("owner", "first-film", "a")
	expect(first).toEqual({ kind: "reserved", id: "reservation-1", platformPays: true })
	expect(await reserveTopicVideoAnimation("owner", "second-film", "b")).toMatchObject({ platformPays: false })

	// A pre-submission failure returns the first film's slot to the plan.
	await releaseTopicVideoAnimation("reservation-1")
	expect(await reserveTopicVideoAnimation("owner", "third-film", "c")).toMatchObject({ platformPays: true })
})

test("reuses another film's exact picture before checking the monthly limit", async () => {
	// The lookup is scoped to the current account and calendar month.
	const queries = stubConnectionPool(({ text }) =>
		text.includes('from "users"') ? [["free", "user"]] : [["original"]],
	)
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
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["free", "user"]] : [[null]]))
	expect(await reserveTopicVideoAnimation("owner", "episode", "picture")).toEqual({ kind: "full" })
})

// model the locked episode owner and the month's reservations across successive calls
function stubAnimationReservations(plan: Plan, role: "user" | "admin", used: number): SentQuery[] {
	// Keep the included reservations so a later release affects the next admission.
	const included = new Set<string>()
	let inserted = 0
	return stubConnectionPool(({ text, values }) => {
		if (text.includes('from "users"')) {
			return [[plan, role]]
		}
		if (text.includes("count(")) {
			expect(text).toContain('"uses_plan_allowance" =')
			expect(values).toContain(true)
			return [[used + included.size]]
		}
		if (text.startsWith("insert")) {
			// Only included pictures use up a slot in the monthly count.
			inserted++
			const id = `reservation-${inserted}`
			if (values.includes(true)) {
				included.add(id)
			}
			return [[id]]
		}
		if (text.startsWith("delete")) {
			included.delete(String(values[0]))
		}
		return []
	})
}
