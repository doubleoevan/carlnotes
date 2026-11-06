import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as authorization from "./authorization"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { loadPersonalSourcesConfirmationLinks } from "./personalSourceEntries"
import { personalSourceEntries, personalSourcesLinks } from "./schema/personalSources"
import { topics } from "./schema/topics"

// restore keys, gates, and database substitutions after each fixture
const restoreEnv = saveEnvSettings(["CHAT_TEXT_KEY"])
afterEach(() => {
	restoreEnv()
	restoreConnectionPool()
	mock.restore()
})
const confirmation = { userId: "sender", topicId: "topic", entryId: "entry" }

test("confirmation links require authority before any private content read", async () => {
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	const queries = stubConnectionPool(() => [toTableRow(topics, { id: "topic" })])
	expect(await loadPersonalSourcesConfirmationLinks(confirmation)).toEqual([])
	expect(queries).toHaveLength(1)
})

test("confirmation links are sender scoped, retained, send-only, deduplicated, and waiting for review", async () => {
	// prepare one retained send with queued, already scored, and existing Finding URLs
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 9).toString("base64")
	const urls = ["https://example.com/queued", "https://example.com/scored", "https://example.com/finding"]
	const encryptedPayload = encryptPrivateText(
		JSON.stringify({
			title: "Research",
			text: "private canary",
			sender: "ChatGPT",
			senderKind: "agent",
			links: urls,
			chatUrl: null,
		}),
	)
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic" })]
		}
		if (text.includes('from "personal_source_entries"')) {
			return [
				toTableRow(personalSourceEntries, {
					id: "entry",
					topicId: "topic",
					userId: "sender",
					origin: "send",
					encryptedPayload,
					receivedAt: new Date(),
					expiresAt: null,
				}),
			]
		}
		if (text.includes('from "personal_source_links"')) {
			return urls.map((_, position) =>
				toTableRow(personalSourcesLinks, {
					id: `link-${position}`,
					entryId: "entry",
					position,
					state: position === 1 ? "considered" : "queued",
					reviewOutcome: "scored",
				}),
			)
		}
		return [
			[urls[0], null, "Queued article"],
			[urls[2], "finding-id", "Existing Finding"],
		]
	})
	expect(await loadPersonalSourcesConfirmationLinks(confirmation)).toEqual([
		{ url: "https://example.com/queued", title: "Queued article" },
	])
	const privateRead = queries.find((query) => query.text.includes('from "personal_source_entries"'))
	expect(privateRead?.values).toEqual(expect.arrayContaining(["sender", "topic", "entry", "send"]))
	expect(privateRead?.text).not.toContain("clock_timestamp()")
	expect(privateRead?.text).not.toContain('"expires_at"')
})

test("a deleted send returns no stale confirmation links", async () => {
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [toTableRow(topics, { id: "topic" })] : []))
	expect(await loadPersonalSourcesConfirmationLinks(confirmation)).toEqual([])
})
