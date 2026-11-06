// both MCP routes advertise one additive tool and preserve send outcomes without leaking private input
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import * as sendService from "@carlnotes/pipeline/personalSources/send"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as mcpViewData from "./mcpViewData"
import { registerPersonalSourcesTools } from "./personalSourcesTools"
import type { ToolCaller } from "./toolCaller"
import type { RegisterToolsOptions } from "./toolShapes"

// each fixture isolates its service spy and registers the production handler
afterEach(() => mock.restore())
beforeEach(() => {
	spyOn(mcpViewData, "loadSendMcpViewData").mockResolvedValue({
		session: null,
		podcastEpisodes: [],
		sendConfirmationLinks: [{ entryId: "entry", links: [{ url: "https://example.com/confirmation-only" }] }],
	})
})
const caller: ToolCaller = {
	kind: "user",
	userId: "owner",
	clientId: "verified-client",
	clientName: "Untrusted name",
	plan: "free",
}
const input = {
	topic_id: "bound-topic",
	title: "A useful link",
	summary: "private-canary",
	links: [],
	chat_url: "https://claude.ai/chat/private",
}
function registeredSend(
	routeTopicId: string | null,
	toolCaller: ToolCaller = caller,
): {
	config: { annotations: Record<string, boolean>; title: string; _meta: unknown }
	handler: (payload: typeof input) => Promise<CallToolResult>
} {
	let registered: ReturnType<typeof registeredSend> | undefined
	registerPersonalSourcesTools({
		mcpServer: {
			registerTool: (
				name: string,
				config: ReturnType<typeof registeredSend>["config"],
				handler: ReturnType<typeof registeredSend>["handler"],
			) => {
				if (name === "send_to_topic") {
					registered = { config, handler }
				}
			},
		} as unknown as RegisterToolsOptions["mcpServer"],
		toolCaller,
		routeTopicId,
		clientAddress: null,
	})
	if (!registered) {
		throw new Error("Missing send registration")
	}
	return registered
}

test.each([null, "bound-topic"])(
	"the send tool delegates verified identity and route binding: %s",
	async (routeTopicId) => {
		const result: PersonalSourcesSendResult = {
			status: "accepted",
			topic: { id: "bound-topic", name: "Coffee", url: "https://carlnotes.com/t/bound-topic" },
			entryId: "entry",
			title: input.title,
			queuedLinkCount: 2,
		}
		const send = spyOn(sendService, "sendToPersonalSources").mockResolvedValue(result)
		const tool = registeredSend(routeTopicId)
		expect(tool.config.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false })
		expect(tool.config.title).toBe("Send to a Topic")
		expect(JSON.stringify(tool.config._meta)).toContain("ui://carlnotes/topic.html")
		const response = await tool.handler(input)
		expect(send).toHaveBeenCalledWith({
			sender: { kind: "oauth", userId: "owner", clientId: "verified-client" },
			payload: input,
			routeTopicId,
			analyticsProperties: expect.objectContaining({ entryPoint: "mcp", plan: "free" }),
		})
		expect(response.structuredContent).toEqual(result)
		expect(JSON.stringify(response.structuredContent)).not.toContain("confirmation-only")
		expect(JSON.stringify(response._meta)).toContain("confirmation-only")
		expect(JSON.stringify(response)).not.toContain("private-canary")
		expect(JSON.stringify(response)).not.toContain(input.chat_url)
	},
)

test("visitors get sign-in guidance and a missing azp cannot send", async () => {
	const send = spyOn(sendService, "sendToPersonalSources")
	const visitor = await registeredSend(null, { kind: "visitor", clientName: "test" }).handler(input)
	expect(JSON.stringify(visitor)).toContain("connected CarlNotes account")
	const missingClient = await registeredSend(null, { ...caller, clientId: null }).handler(input)
	expect(missingClient.structuredContent).toEqual({ status: "disconnected" })
	expect(send).not.toHaveBeenCalled()
})

test.each([
	{ status: "quota", resetAt: "2026-11-03T00:00:00.000Z" },
	{ status: "disconnected" },
	{ status: "unavailable", reason: "disabled" },
	{ status: "not_found" },
	{ status: "conflict", reason: "removed" },
] satisfies PersonalSourcesSendResult[])(
	"the MCP view and text receive the same %s outcome without an automatic retry",
	async (result) => {
		const send = spyOn(sendService, "sendToPersonalSources").mockResolvedValue(result)
		const response = await registeredSend(null).handler(input)
		expect(response.structuredContent).toEqual(result)
		expect(response.content?.[0]?.type).toBe("text")
		expect(send).toHaveBeenCalledTimes(1)
	},
)
