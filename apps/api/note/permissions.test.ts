// permission tests for the note visibility rules, decided from the page access
import { expect, test } from "bun:test"
import { canDeleteNote, canEditNote, canSeeNote, creatableNoteVisibilities, type PageAccess } from "./permissions"

// an access shorthand for the fields below
function access(overrides: Partial<PageAccess> = {}): PageAccess {
	return { canSeePage: true, isHoldingTeamMember: false, isPageOwner: false, isAdmin: false, ...overrides }
}

// a private note is its owner's alone, in both directions
test("private is visible and editable by its owner only", () => {
	const note = { visibility: "private" as const, ownerUserId: "u1" }
	expect(canSeeNote("u1", note, access())).toBe(true)
	expect(canEditNote("u1", note, access())).toBe(true)
	// another user, a member, and a visitor all see nothing
	expect(canSeeNote("u2", note, access({ isHoldingTeamMember: true }))).toBe(false)
	expect(canSeeNote(null, note, access())).toBe(false)
	expect(canEditNote("u2", note, access({ isHoldingTeamMember: true }))).toBe(false)
})

// a team note belongs to the holding team's members, read and write alike
test("team is visible and editable by every holding-team member", () => {
	const note = { visibility: "team" as const, ownerUserId: "u9" }
	expect(canSeeNote("u1", note, access({ isHoldingTeamMember: true }))).toBe(true)
	expect(canEditNote("u1", note, access({ isHoldingTeamMember: true }))).toBe(true)
	// a non-member and a visitor stay out, the page owner included when they left the team
	expect(canSeeNote("u2", note, access())).toBe(false)
	expect(canSeeNote(null, note, access())).toBe(false)
	expect(canEditNote("u2", note, access({ isPageOwner: true }))).toBe(false)
})

// a public note reads for everyone and writes for the page owner and holding-team members
test("public is visible to everyone and editable by the page owner and members", () => {
	const note = { visibility: "public" as const, ownerUserId: "u9" }
	expect(canSeeNote(null, note, access())).toBe(true)
	expect(canSeeNote("u2", note, access())).toBe(true)
	// the write tightens: owner and members yes, other users and visitors no
	expect(canEditNote("u1", note, access({ isPageOwner: true }))).toBe(true)
	expect(canEditNote("u1", note, access({ isHoldingTeamMember: true }))).toBe(true)
	expect(canEditNote("u2", note, access())).toBe(false)
	expect(canEditNote(null, note, access())).toBe(false)
})

// an invisible page hides every note whatever the visibility says
test("no note is visible past an invisible page", () => {
	const hidden = access({ canSeePage: false, isHoldingTeamMember: true, isPageOwner: true })
	expect(canSeeNote("u1", { visibility: "public", ownerUserId: "u9" }, hidden)).toBe(false)
	expect(canSeeNote("u1", { visibility: "private", ownerUserId: "u1" }, hidden)).toBe(false)
	expect(canEditNote("u1", { visibility: "team", ownerUserId: "u9" }, hidden)).toBe(false)
	expect(creatableNoteVisibilities("u1", hidden)).toEqual([])
})

// an admin moderates, so somebody else's private note is readable and the invisible page is no barrier
test("an admin sees every note", () => {
	const admin = access({ isAdmin: true })
	expect(canSeeNote("u1", { visibility: "private", ownerUserId: "u9" }, admin)).toBe(true)
	expect(canSeeNote("u1", { visibility: "team", ownerUserId: "u9" }, admin)).toBe(true)
	expect(
		canSeeNote("u1", { visibility: "private", ownerUserId: "u9" }, access({ isAdmin: true, canSeePage: false })),
	).toBe(true)
})

// deleting is the owner's or an admin's, and nobody else's
test("an admin deletes anyone's note, a member deletes nobody else's", () => {
	const note = { ownerUserId: "u9" }
	expect(canDeleteNote("u9", note, access())).toBe(true)
	expect(canDeleteNote("u1", note, access({ isAdmin: true }))).toBe(true)
	expect(canDeleteNote("u1", note, access({ isHoldingTeamMember: true, isPageOwner: true }))).toBe(false)
	expect(canDeleteNote(null, note, access({ isAdmin: true }))).toBe(false)
})

// creating matches the user: private signed in, team as a member, public as the page owner or a member
test("creatableNoteVisibilities matches the user", () => {
	expect(creatableNoteVisibilities(null, access())).toEqual([])
	expect(creatableNoteVisibilities("u1", access())).toEqual(["private"])
	expect(creatableNoteVisibilities("u1", access({ isPageOwner: true }))).toEqual(["private", "public"])
	expect(creatableNoteVisibilities("u1", access({ isHoldingTeamMember: true }))).toEqual(["private", "team", "public"])
})
