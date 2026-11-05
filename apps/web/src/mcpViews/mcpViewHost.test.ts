import { afterEach, expect, mock, test } from "bun:test"
import type { App } from "@modelcontextprotocol/ext-apps"
import { openHostLink, setMcpViewApp } from "./mcpViewHost"

// release the synthetic host after each bridge outcome
afterEach(() => setMcpViewApp(null))

test("absolute Topic and article links reach the host unchanged", async () => {
	const openLink = mock(async () => ({}))
	setMcpViewApp({ openLink } as unknown as App)
	for (const url of ["http://localhost:5173/topics/humidity", "https://en.wikipedia.org/wiki/Terrarium"]) {
		await openHostLink(url)
		expect(openLink).toHaveBeenLastCalledWith({ url })
	}
})

test("host refusal, disconnect, and timeout reject instead of failing silently", async () => {
	await expect(openHostLink("https://carlnotes.com")).rejects.toThrow("not connected")
	setMcpViewApp({ openLink: async () => ({ isError: true }) } as unknown as App)
	await expect(openHostLink("https://carlnotes.com")).rejects.toThrow("declined")
	setMcpViewApp({
		openLink: async () => {
			throw new Error("timeout")
		},
	} as unknown as App)
	await expect(openHostLink("https://carlnotes.com")).rejects.toThrow("timeout")
})
