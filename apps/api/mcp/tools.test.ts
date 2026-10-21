// tool registration tests: what every mcp client and its model read in the tool descriptions
import { expect, test } from "bun:test"
import { registerTools } from "./tools"

// a registered tool's title and description
type RegisteredToolConfig = { title?: string; description?: string }

// every tool description speaks to the client, and none names an internal identifier
test("the tool descriptions address the client and name no internal identifier", () => {
	// a fake server that keeps each registered tool's config by its name
	const configsByToolName = new Map<string, RegisteredToolConfig>()
	const fakeMcpServer = {
		registerTool: (toolName: string, config: RegisteredToolConfig) => {
			configsByToolName.set(toolName, config)
			return {}
		},
	}
	registerTools(
		fakeMcpServer as unknown as Parameters<typeof registerTools>[0],
		{ kind: "visitor", clientName: "test-app" },
		null,
	)

	// the topic list speaks to the client, and no description names the tool caller
	expect(configsByToolName.get("list_topics")?.description).toStartWith("The topics you may read")
	const toolsNamingTheCaller = [...configsByToolName]
		.filter(([, { description }]) => description?.includes("toolCaller"))
		.map(([toolName]) => toolName)
	expect(toolsNamingTheCaller).toEqual([])
})
