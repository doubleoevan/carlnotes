// creation reuses Topic Draft validation and limits only after an exact confirmed preview
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { createTopicPayload } from "@carlnotes/contracts/topicPayloads"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as defaultTeams from "../team/defaultTeam"
import * as draftTools from "../tool/topicDraftTools"
import type { RegisterToolsOptions } from "./toolShapes"
import {
	isTopicDraftConfirmed,
	toTopicDraftConfirmation,
	toTopicDraftConfirmationRecord,
} from "./topicDraftConfirmations"
import * as draftOptions from "./topicDraftMcpViewOptions"
import { registerTopicEditTools } from "./topicEditTools"

// synthetic authentication secret and a private send destination
const priorSecret = Bun.env.BETTER_AUTH_SECRET
const topicDraft = createTopicPayload.parse({
	name: "Coffee",
	prompt: "Home roasting",
	visibility: "private",
	isPodcastEnabled: false,
})
const subject = { userId: "owner", clientId: "client", topicDraft }

// each test signs with the synthetic secret and restores the spies and the secret after
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-topic-draft-secret"
})
afterEach(() => {
	mock.restore()
	Bun.env.BETTER_AUTH_SECRET = priorSecret
})

test("a confirmation binds exact draft, owner, client, and expiry", () => {
	const confirmation = toTopicDraftConfirmation(subject, 1000)
	expect(isTopicDraftConfirmed(subject, confirmation, 1001)).toBe(true)

	// a change to the owner, client, or draft does not match
	for (const changed of [
		{ ...subject, userId: "other" },
		{ ...subject, clientId: "other" },
		{ ...subject, topicDraft: { ...topicDraft, visibility: "public" as const } },
		{ ...subject, topicDraft: { ...topicDraft, prompt: "Changed" } },
	]) {
		expect(isTopicDraftConfirmed(changed, confirmation, 1001)).toBe(false)
	}

	// an expired or extended confirmation does not match
	expect(isTopicDraftConfirmed(subject, confirmation, 1000 + 15 * 60_000)).toBe(false)
	expect(isTopicDraftConfirmed(subject, `${confirmation}.extra`, 1001)).toBe(false)
	// alternate spellings of the signed timestamp must never open another confirmation record for the same preview
	for (const prefix of ["0", "+", " "]) {
		expect(isTopicDraftConfirmed(subject, prefix + confirmation, 1001)).toBe(false)
	}
	expect(isTopicDraftConfirmed(subject, undefined, 1001)).toBe(false)
	// one preview maps to one expiring confirmation record. The record never contains the usable confirmation.
	expect(toTopicDraftConfirmationRecord(confirmation)).toEqual(toTopicDraftConfirmationRecord(confirmation))
	expect(toTopicDraftConfirmationRecord(confirmation).expiresAt.getTime()).toBe(1000 + 15 * 60_000)
	expect(toTopicDraftConfirmationRecord(confirmation).id).not.toContain(
		confirmation.slice(confirmation.indexOf(".") + 1),
	)
	expect(toTopicDraftConfirmationRecord(toTopicDraftConfirmation(subject, 1001)).id).not.toBe(
		toTopicDraftConfirmationRecord(confirmation).id,
	)
})

test("preview does no creation or suggestions; confirmation calls the existing plan and source gate", async () => {
	const create = spyOn(draftTools, "createTopicFromDraft").mockResolvedValue({ status: "quota" })
	const suggest = spyOn(draftTools, "suggestTopicDraftSources")

	// provide account tags and budget defaults without opening a database connection
	const topicDraftOptions = { knownTags: ["Coffee"], isPodcastEnabledByDefault: true }
	const loadOptions = spyOn(draftOptions, "loadTopicDraftMcpViewOptions").mockResolvedValue(topicDraftOptions)
	const handler = toCreateTopicHandler()

	// the preview saves nothing and returns the draft, the account's options, and a confirmation
	const preview = await handler(topicDraft)
	expect(preview.structuredContent).toMatchObject({ status: "createConfirmRequired", afterTopicDraft: topicDraft })
	expect(preview._meta?.[MCP_VIEW_META_KEY]).toMatchObject({ topicDraftOptions })
	expect(loadOptions).toHaveBeenCalledWith(expect.objectContaining({ kind: "user", userId: "owner" }))
	expect(create).not.toHaveBeenCalled()
	expect(suggest).not.toHaveBeenCalled()

	// the text names the confirmation, which creates only the identical draft
	const confirmation = (preview.structuredContent as { confirmation?: string } | undefined)?.confirmation
	expect(preview.content[0]).toMatchObject({
		type: "text",
		text: expect.stringContaining(JSON.stringify(confirmation)),
	})
	await handler({ ...topicDraft, prompt: "Changed", confirmation })
	expect(create).not.toHaveBeenCalled()
	const refused = await handler({ ...topicDraft, confirmation })
	expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", topicDraft, origin: "mcp" }))
	expect(refused.isError).toBe(true)
	expect(JSON.stringify(refused)).toContain("plan's topic limit")
})

// a public draft that leaves out its team previews on the default team, a draft that names no team keeps none, and a
// private draft keeps the team it names
test("create_topic puts a public draft on the default team unless it names none, and a private one on its own", async () => {
	spyOn(draftOptions, "loadTopicDraftMcpViewOptions").mockResolvedValue({
		knownTags: [],
		isPodcastEnabledByDefault: true,
	})
	spyOn(defaultTeams, "loadDefaultTeam").mockResolvedValue({ teamId: "team-1", name: "Roasters" })
	const handler = toCreateTopicHandler()

	// the preview of a draft that leaves out its team names the default team
	const { team: _team, ...draftWithoutTeam } = topicDraft
	const publicDraft = { ...draftWithoutTeam, visibility: "public" }
	const preview = await handler(publicDraft)
	expect(preview.structuredContent).toMatchObject({ afterTopicDraft: { team: { teamId: "team-1", name: "Roasters" } } })

	// a draft that names no team keeps none
	const previewWithoutTeam = await handler({ ...publicDraft, team: null })
	expect(previewWithoutTeam.structuredContent).toMatchObject({ afterTopicDraft: { team: null } })

	// a private draft keeps the team it names, and gets no default team
	const namedTeam = { teamId: "team-2", name: "Cuppers" }
	const privatePreview = await handler({ ...draftWithoutTeam, team: namedTeam })
	expect(privatePreview.structuredContent).toMatchObject({ afterTopicDraft: { team: namedTeam } })
	const privatePreviewWithoutTeam = await handler(draftWithoutTeam)
	expect(privatePreviewWithoutTeam.structuredContent).toMatchObject({ afterTopicDraft: { team: null } })
})

// register the topic edit tools for the owner's client, and return the create_topic handler
function toCreateTopicHandler(): (input: unknown) => Promise<CallToolResult> {
	// a server that keeps only create_topic's handler
	let handler: ((input: unknown) => Promise<CallToolResult>) | undefined
	registerTopicEditTools({
		mcpServer: {
			registerTool: (name: string, _config: unknown, callback: typeof handler) => {
				if (name === "create_topic") {
					handler = callback
				}
			},
		} as unknown as RegisterToolsOptions["mcpServer"],
		toolCaller: { kind: "user", userId: "owner", clientId: "client", clientName: "App", plan: "free" },
		routeTopicId: null,
		clientAddress: null,
	})

	// fail if the tools did not register create_topic
	if (!handler) {
		throw new Error("Missing creation tool")
	}
	return handler
}
