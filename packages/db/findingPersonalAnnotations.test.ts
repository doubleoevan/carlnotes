import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import * as permissions from "./findingPermissions"
import { loadFindingPersonalAnnotation, loadFindingPersonalAnnotations } from "./findingPersonalAnnotations"
import { findingPersonalAnnotations } from "./schema/personalSources"

let restoreEnvSettings: () => void
beforeEach(() => {
	restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 7).toString("base64")
})
// put the mocks, the connection pool, and the env settings back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreEnvSettings()
})

test("owners and admins cannot replace the authenticated sender predicate", async () => {
	const queries = stubConnectionPool()
	const visibility = spyOn(permissions, "isTopicFindingVisible").mockResolvedValue(true)
	for (const userId of ["topic-owner", "admin", "another-sender"]) {
		expect(await loadFindingPersonalAnnotation({ userId, topicId: "topic", findingId: "finding" })).toEqual({
			text: null,
			expiresAt: null,
		})
		expect(queries.at(-1)?.values).toContain(userId)
		expect(queries.at(-1)?.text).toContain('"finding_personal_annotations"."user_id" =')
	}
	expect(visibility).not.toHaveBeenCalled()
})

test("a sender's annotation also requires current Finding visibility", async () => {
	stubConnectionPool(() => [
		toTableRow(findingPersonalAnnotations, {
			findingId: "finding",
			topicId: "topic",
			userId: "sender",
			encryptedText: encryptPrivateText("Private relation"),
			expiresAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
	])
	const visibility = spyOn(permissions, "isTopicFindingVisible").mockResolvedValue(false)
	expect(await loadFindingPersonalAnnotation({ userId: "sender", topicId: "topic", findingId: "finding" })).toEqual({
		text: null,
		expiresAt: null,
	})
	visibility.mockResolvedValue(true)
	expect(await loadFindingPersonalAnnotation({ userId: "sender", topicId: "topic", findingId: "finding" })).toEqual({
		text: "Private relation",
		expiresAt: null,
	})
})

test("a page of annotations runs one query for the sender's rows alone", async () => {
	const queries = stubConnectionPool(() => [
		["finding-1", encryptPrivateText("First relation")],
		["finding-2", "unreadable"],
	])
	const textByFindingId = await loadFindingPersonalAnnotations({
		userId: "sender",
		findingIds: ["finding-1", "finding-2", "finding-3"],
	})

	// one bounded query, on the sender's rows, returns what it can decrypt
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain('"finding_personal_annotations"."user_id" =')
	expect(queries[0]?.text).toContain('"finding_personal_annotations"."finding_id" in')
	expect(queries[0]?.values).toContain("sender")
	expect([...textByFindingId.entries()]).toEqual([["finding-1", "First relation"]])
})

test("an empty page of annotations runs no query", async () => {
	const queries = stubConnectionPool()
	expect((await loadFindingPersonalAnnotations({ userId: "sender", findingIds: [] })).size).toBe(0)
	expect(queries).toHaveLength(0)
})
