// the mcp server. one handler serves /mcp and the topic-bound /mcp/t/:topicId with the same tools
import { StreamableHTTPTransport } from "@hono/mcp"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { db } from "../../db"
import { oauthApplications } from "../../db/schema"
import { type AppEnv, currentUser } from "../currentUser"
import { resolveToolCaller } from "./toolCaller"
import { registerTools } from "./tools"

// the name and version the mcpServer reports on initialize
const SERVER_NAME = "carlnotes"
const SERVER_VERSION = "1.0.0"

// the two mcp routes. both run one handler and differ only in the bound topic
export const mcpRoute = new Hono<AppEnv>()
	.all("/mcp", (context) => handleMcpRequest(context, null))
	.all("/mcp/t/:topicId", (context) => handleMcpRequest(context, context.req.param("topicId")))

// the registered name of an mcp client
export const mcpClientsRoute = new Hono<AppEnv>().get("/mcp/clients/:clientId", async (context) => {
	// reject a visitor
	if (!currentUser(context)) {
		return context.json({ error: "unauthorized" }, 401)
	}

	// look the client's name up by id
	const [client] = await db
		.select({ name: oauthApplications.name })
		.from(oauthApplications)
		.where(eq(oauthApplications.clientId, context.req.param("clientId")))
	return client ? context.json({ name: client.name }) : context.json({ error: "not found" }, 404)
})

// serve one request with the tools registered for the tool caller the rate limit resolved
async function handleMcpRequest(context: Context<AppEnv>, routeTopicId: string | null): Promise<Response> {
	const toolCaller = context.get("toolCaller") ?? (await resolveToolCaller(context.req.raw.headers))
	const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
	registerTools(mcpServer, toolCaller, routeTopicId)

	// connect a stateless transport. no session id, and a json response to each post
	const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
	await mcpServer.connect(transport)
	return (await transport.handleRequest(context)) ?? context.body(null, 204)
}
