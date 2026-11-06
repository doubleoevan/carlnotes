// a Topic link, where only the newest click's read moves the MCP view
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import { McpViewLink } from "./McpViewLink"
import * as history from "./mcpViewHistory"
import * as host from "./mcpViewHost"

afterEach(() => mock.restore())

test("a slower read never replaces the destination of a later click", async () => {
	// each read waits until the test returns its result
	const returnToolResults: (() => void)[] = []
	spyOn(host, "callMcpViewTool").mockImplementation(
		() => new Promise((resolve) => returnToolResults.push(() => resolve({ content: [] }))),
	)
	const navigateMcpView = spyOn(history, "navigateMcpView").mockImplementation(() => {})
	const harness = await renderTestHook(
		() => null,
		() => (
			<>
				<McpViewLink topicId="topic-1" href="/topics/topic-1">
					First
				</McpViewLink>
				<McpViewLink topicId="topic-2" href="/topics/topic-2">
					Second
				</McpViewLink>
			</>
		),
	)
	try {
		// click both links, then return the second read before the first
		const [firstLink, secondLink] = harness.container.querySelectorAll("a")
		await act(async () => {
			firstLink?.click()
			secondLink?.click()
		})
		await act(async () => {
			returnToolResults[1]?.()
			returnToolResults[0]?.()
		})
		expect(navigateMcpView.mock.calls.map(([path]) => path)).toEqual(["/findings/topic-2"])
	} finally {
		await harness.close()
	}
})
