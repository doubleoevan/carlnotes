import { afterEach, expect, mock, test } from "bun:test"
import type { App } from "@modelcontextprotocol/ext-apps"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import { openMcpViewLink, setMcpViewApp, useMcpViewLinkError } from "./mcpViewHost"

// the url every link error test opens
const SITE_LINK = "https://carlnotes.com"

// release the synthetic host after each bridge outcome
afterEach(() => setMcpViewApp(null))

test("absolute Topic and article links reach the host unchanged", async () => {
	const openLink = mock(async () => ({}))
	setMcpViewApp({ openLink } as unknown as App)
	for (const url of ["http://localhost:5173/topics/humidity", "https://en.wikipedia.org/wiki/Terrarium"]) {
		await openMcpViewLink(url)
		expect(openLink).toHaveBeenLastCalledWith({ url })
	}
})

test("a declined link, a disconnect, and a timeout show the link error instead of failing silently", async () => {
	const harness = await renderTestHook(useMcpViewLinkError)
	try {
		// a host that is not connected
		await act(() => openMcpViewLink(SITE_LINK))
		expect(harness.read()).toContain("could not open this link")

		// a host that declines, then a host that throws an error
		setMcpViewApp({ openLink: async () => ({ isError: true }) } as unknown as App)
		await act(() => openMcpViewLink(SITE_LINK))
		expect(harness.read()).toContain("could not open this link")
		setMcpViewApp({
			openLink: async () => {
				throw new Error("timeout")
			},
		} as unknown as App)
		await act(() => openMcpViewLink(SITE_LINK))
		expect(harness.read()).toContain("could not open this link")

		// a host that opens the link clears the error
		setMcpViewApp({ openLink: async () => ({}) } as unknown as App)
		await act(() => openMcpViewLink(SITE_LINK))
		expect(harness.read()).toBeNull()
	} finally {
		await harness.close()
	}
})
