// migration preserves private text before releasing the legacy publication guard
import { afterEach, beforeEach, expect, test } from "bun:test"
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { migratePersonalSourcesPrivacy } from "./personalSourcesMigration"
import { topicPersonalSourceContexts } from "./schema/personalSources"
import { findings } from "./schema/scans"
import { topics } from "./schema/topics"

let restoreEnvSettings: () => void
const activation = "2026-11-02T12:00:00.000Z"
beforeEach(() => {
	restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 8).toString("base64")
})
afterEach(() => {
	restoreConnectionPool()
	restoreEnvSettings()
})

// simulate an overlapping Scan and an idempotent completion flag with the real SQL builders
function stubLegacyRows(): ReturnType<typeof stubConnectionPool> {
	let isConverted = false
	return stubConnectionPool(({ text }) => {
		if (text.startsWith('update "topic_personal_source_contexts"')) {
			isConverted = true
			return []
		}
		if (text.includes('from "topic_personal_source_contexts"')) {
			return isConverted
				? []
				: [
						toTableRow(topicPersonalSourceContexts, {
							topicId: "topic",
							userId: "sender",
							activatedAt: activation,
							publicOutputsVersion: 0,
						}),
					]
		}
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic", ownerId: "sender", visibility: "private" })]
		}
		if (text.includes('from "findings"')) {
			return [toTableRow(findings, { id: "finding", topicId: "topic", relevanceExplanation: "Private finding canary" })]
		}
		return text.includes('from "scans"') ? [["scan", "Private report canary"]] : []
	})
}

test("conversion encrypts both legacy fields before clearing them, covers overlapping Scans, and replays safely", async () => {
	const queries = stubLegacyRows()
	await migratePersonalSourcesPrivacy()
	const snapshots = queries.filter((query) => query.text.startsWith('insert into "personal_source_legacy_outputs"'))
	expect(snapshots).toHaveLength(2)
	expect(
		snapshots.flatMap((query) =>
			query.values
				.filter((value) => typeof value === "string" && value.startsWith("enc1:"))
				.map((value) => decryptPrivateText(String(value))),
		),
	).toEqual(["Private finding canary", "Private report canary"])
	expect(JSON.stringify(queries)).not.toContain("Private finding canary")
	expect(JSON.stringify(queries)).not.toContain("Private report canary")
	expect(queries.find((query) => query.text.includes('from "findings"'))?.text).toContain('"updated_at" >=')
	expect(queries.find((query) => query.text.includes('from "scans"'))?.text).toContain('"finished_at" >=')
	expect(queries.find((query) => query.text.includes('from "scans"'))?.text).toContain('"finished_at" is null')
	expect(queries.some((query) => query.text.startsWith('delete from "personal_source_entries"'))).toBe(false)
	await migratePersonalSourcesPrivacy()
	expect(queries.filter((query) => query.text.startsWith('insert into "personal_source_legacy_outputs"'))).toHaveLength(
		2,
	)
})

test("missing encryption cannot release the publication guard or clear a public field", async () => {
	Bun.env.CHAT_TEXT_KEY = ""
	const queries = stubLegacyRows()
	await expect(migratePersonalSourcesPrivacy()).rejects.toThrow()
	expect(queries.some((query) => query.text.startsWith('update "findings"'))).toBe(false)
	expect(queries.some((query) => query.text.startsWith('update "scans"'))).toBe(false)
	expect(queries.some((query) => query.text.startsWith('update "topic_personal_source_contexts"'))).toBe(false)
})
