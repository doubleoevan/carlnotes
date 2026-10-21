// permission tests for the invite-topic activation rule and the effective-role resolver's pure branches
import { expect, test } from "bun:test"
import { isVisibleAfterActivation, toTopicEditRole, toTopicRole } from "./permissions"

// a subscriber sees a finding only when its scan started after their subscription activated
test("isVisibleAfterActivation opens findings from scans after the activation", () => {
	const activatedAt = new Date("2026-07-20T00:00:00.000Z")
	// a scan from before the activation stays hidden, so the back catalog never opens
	expect(isVisibleAfterActivation(new Date("2026-07-19T00:00:00.000Z"), activatedAt)).toBe(false)
	// a scan at the exact activation instant is not after it, so it stays hidden too
	expect(isVisibleAfterActivation(new Date("2026-07-20T00:00:00.000Z"), activatedAt)).toBe(false)
	// a scan after the activation is visible
	expect(isVisibleAfterActivation(new Date("2026-07-21T00:00:00.000Z"), activatedAt)).toBe(true)
})

// with no active subscription nothing opens, which covers an invited user who has not accepted yet
test("isVisibleAfterActivation rejects a user with no active subscription", () => {
	expect(isVisibleAfterActivation(new Date("2026-07-21T00:00:00.000Z"), null)).toBe(false)
})

// the resolver's decisions that need no membership row: ownership and a signed-out user
test("toTopicRole answers ownership and the no-grant cases without a membership", async () => {
	// the owner is the owner even when the topic also has a team
	expect(await toTopicRole("u1", { id: "t1", ownerId: "u1", teamId: "team1" })).toBe("owner")
	// a signed-out user holds nothing
	expect(await toTopicRole(null, { id: "t1", ownerId: "u1", teamId: "team1" })).toBe(null)
})

// editing narrows to the owner and their own team, the decisions that need no membership row
test("toTopicEditRole answers ownership and the no-team cases without a membership", async () => {
	// the owner edits their own topic whether or not a team holds it
	expect(await toTopicEditRole("u1", { ownerId: "u1", teamId: "team1" })).toBe("owner")
	expect(await toTopicEditRole("u1", { ownerId: "u1", teamId: null })).toBe("owner")
	// a topic on no team is nobody else's to edit, however they can see it
	expect(await toTopicEditRole("u2", { ownerId: "u1", teamId: null })).toBe(null)
	// a signed-out user holds nothing
	expect(await toTopicEditRole(null, { ownerId: "u1", teamId: "team1" })).toBe(null)
})
