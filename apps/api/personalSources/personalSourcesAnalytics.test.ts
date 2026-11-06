// the Personal sources routes report each change a sender makes, by its ids and counts and never its content
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as agentSetup from "@carlnotes/db/personalSourcesAiAgentSetup"
import * as imports from "@carlnotes/db/personalSourcesImports"
import * as lifecycle from "@carlnotes/db/personalSourcesLifecycle"
import * as work from "@carlnotes/pipeline/personalSources/work"
import * as analytics from "@carlnotes/server/analytics"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { personalSourcesImportsRoute } from "./importsRoute"
import { personalSourcesRoute } from "./personalSourcesRoute"

// the properties every signed-in request from a browser with no user agent sends
const WEB_PROPERTIES = { entryPoint: "web", plan: "free" }

// a request's own session, the sender's Topic, and a selected conversation with private text
const app = toSignedInApp(personalSourcesRoute, "sender")
const importApp = toSignedInApp(personalSourcesImportsRoute, "sender")
const importPayload = {
	requestId: "batch-a",
	provider: "chatgpt",
	conversations: [
		{
			conversationId: "first",
			title: "private-title",
			text: "private-text",
			links: [],
			omittedLinkCount: 0,
			chatUrl: null,
		},
	],
}

// put the spies back after each test
afterEach(() => mock.restore())

// report events through a spy, and treat the notification of the summary workflow as done
function spyOnEvents(): ReturnType<typeof spyOn<typeof analytics, "trackEvent">> {
	spyOn(work, "notifyPersonalSourcesChanged").mockResolvedValue()
	return spyOn(analytics, "trackEvent")
}

test("connecting an app to a Topic reports a new Source and not one the Topic already has", async () => {
	const trackEventSpy = spyOnEvents()
	const addPersonalSourcesAiAgentSpy = spyOn(agentSetup, "addPersonalSourcesAiAgent").mockResolvedValue("added")
	await app.request("/topics/topic/personal-sources/ai-agents", toJsonRequest({ clientId: "client" }))
	expect(trackEventSpy.mock.calls).toEqual([
		[
			"source_added",
			"sender",
			expect.objectContaining({ ...WEB_PROPERTIES, topicId: "topic", sourceType: "ai_agent" }),
		],
	])

	// the same request again succeeds without a second report
	trackEventSpy.mockClear()
	addPersonalSourcesAiAgentSpy.mockResolvedValue("alreadyAdded")
	const repeatedAddResponse = await app.request(
		"/topics/topic/personal-sources/ai-agents",
		toJsonRequest({ clientId: "client" }),
	)
	expect(repeatedAddResponse.status).toBe(200)
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("an import reports its entries and none of its text", async () => {
	const trackEventSpy = spyOnEvents()
	const importRequest = toJsonRequest(importPayload)
	spyOn(imports, "importPersonalSourcesConversations").mockResolvedValue({ status: "accepted", entryIds: ["a", "b"] })
	await importApp.request("/topics/topic/personal-sources/imports", importRequest)
	expect(trackEventSpy.mock.calls).toEqual([
		[
			"personal_source_entry_received",
			"sender",
			expect.objectContaining({ ...WEB_PROPERTIES, origin: "import", topicId: "topic", entryCount: 2 }),
		],
	])
	expect(JSON.stringify(trackEventSpy.mock.calls)).not.toContain("private-")

	// an import that was not saved reports nothing
	trackEventSpy.mockClear()
	spyOn(imports, "importPersonalSourcesConversations").mockResolvedValue({ status: "not_found" })
	await importApp.request("/topics/topic/personal-sources/imports", importRequest)
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("deleting an entry reports it, and an entry the sender may not delete reports nothing", async () => {
	const trackEventSpy = spyOnEvents()
	const deletePersonalSourceEntrySpy = spyOn(lifecycle, "deletePersonalSourceEntry").mockResolvedValue(true)
	await app.request("/topics/topic/personal-sources/entries/entry", { method: "DELETE" })
	expect(trackEventSpy.mock.calls).toEqual([
		["personal_source_entry_deleted", "sender", expect.objectContaining({ ...WEB_PROPERTIES, topicId: "topic" })],
	])

	// a missing entry keeps its 404
	trackEventSpy.mockClear()
	deletePersonalSourceEntrySpy.mockResolvedValue(false)
	const missingEntryResponse = await app.request("/topics/topic/personal-sources/entries/entry", { method: "DELETE" })
	expect(missingEntryResponse.status).toBe(404)
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("deleting a Source reports its kind, a repeat reports nothing, and a Source the sender may not delete is a 404", async () => {
	const trackEventSpy = spyOnEvents()
	const deletePersonalSourceSpy = spyOn(lifecycle, "deletePersonalSource").mockResolvedValue({
		deletedSourceKind: "email",
	})
	await app.request("/topics/topic/personal-sources/sources/source", { method: "DELETE" })
	expect(trackEventSpy.mock.calls).toEqual([
		["source_removed", "sender", expect.objectContaining({ topicId: "topic", sourceType: "email" })],
	])

	// the repeat still succeeds, and still asks for the summary to be rebuilt
	trackEventSpy.mockClear()
	deletePersonalSourceSpy.mockResolvedValue({ deletedSourceKind: null })
	const repeatedDeleteResponse = await app.request("/topics/topic/personal-sources/sources/source", {
		method: "DELETE",
	})
	expect(repeatedDeleteResponse.status).toBe(200)
	expect(trackEventSpy).not.toHaveBeenCalled()

	// a sender without the capability sees a missing Source
	deletePersonalSourceSpy.mockResolvedValue(null)
	const rejectedDeleteResponse = await app.request("/topics/topic/personal-sources/sources/source", {
		method: "DELETE",
	})
	expect(rejectedDeleteResponse.status).toBe(404)
	expect(trackEventSpy).not.toHaveBeenCalled()
})
