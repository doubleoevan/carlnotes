// personal sources authority is sender-only, even when general topic moderation grants wider powers
import { afterEach, expect, test } from "bun:test"
import { isAllowed } from "./authorization"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "./connectionPoolStub"

// keep database substitutions local to each fixture
afterEach(restoreConnectionPool)
const personalTopic = { id: "topic-1", ownerId: "owner-1", visibility: "private", teamId: null } as const

test("the owner can receive, import, read, and delete on every plan", async () => {
	stubConnectionPool(({ text }) =>
		text.includes('from "users"') && !text.includes('from "topic_personal_source_contexts"')
			? [FREE_USER_ACCESS_ROW]
			: [],
	)
	for (const capability of [
		"personalSources:read",
		"personalSources:send",
		"personalSources:import",
		"personalSources:delete",
	] as const) {
		expect(await isAllowed("owner-1", capability, personalTopic)).toBe(true)
		expect(await isAllowed("other-1", capability, personalTopic)).toBe(false)
		expect(await isAllowed(null, capability, personalTopic)).toBe(false)
	}
})

test("administrative edit authority permits a sender's own contributions", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [ADMIN_USER_ACCESS_ROW] : []))
	expect(await isAllowed("admin-1", "personalSources:send", personalTopic)).toBe(true)
	expect(await isAllowed("admin-1", "personalSources:read", personalTopic)).toBe(true)
})

test("all editable visibilities accept contributions", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : []))
	for (const visibility of ["private", "invite", "public"] as const) {
		expect(await isAllowed("owner-1", "personalSources:send", { ...personalTopic, visibility })).toBe(true)
	}
	expect(await isAllowed("owner-1", "personalSources:send", { ...personalTopic, teamId: "team-1" })).toBe(true)
})

test("owning-Team members edit only while both sender and owner remain active", async () => {
	const topic = { ...personalTopic, teamId: "team-1" }
	for (const [memberships, expected] of [
		[
			[
				["owner-1", "leader"],
				["member-1", "member"],
			],
			true,
		],
		[[["member-1", "member"]], false],
		[[["owner-1", "leader"]], false],
		[[], false],
	] as const) {
		stubConnectionPool(({ text }) =>
			text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : memberships.map((row) => [...row]),
		)
		expect(await isAllowed("member-1", "personalSources:send", topic)).toBe(expected)
	}
})

test("a follower or holding-Team member has no contribution authority", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : []))
	expect(await isAllowed("other-1", "personalSources:send", { ...personalTopic, visibility: "public" })).toBe(false)
})

test("downgrade stops paid confirmation and key creation while retaining cleanup", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : []))
	expect(await isAllowed("owner-1", "personalSources:email", personalTopic)).toBe(false)
	expect(await isAllowed("owner-1", "personalSources:apiKey")).toBe(false)
	expect(await isAllowed("owner-1", "personalSources:credentials")).toBe(true)
	expect(await isAllowed("owner-1", "personalSources:delete", personalTopic)).toBe(true)
	// a paid plan allows both again
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["user", "premium", null]] : []))
	expect(await isAllowed("owner-1", "personalSources:email", personalTopic)).toBe(true)
	expect(await isAllowed("owner-1", "personalSources:apiKey")).toBe(true)
})

// Plus adds email receiving without granting the Premium-only agent credential capability
test("Plus can forward email but cannot create agent API keys", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["user", "plus", null]] : []))
	expect(await isAllowed("owner-1", "personalSources:email", personalTopic)).toBe(true)
	expect(await isAllowed("owner-1", "personalSources:apiKey")).toBe(false)
})
