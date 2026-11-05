import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as siteAuth from "@carlnotes/client/authClient"
import { act } from "react"
import { LinkBaseUrlContext, LinkOpenerContext } from "@/components/common/AnchorLink"
import { type HookTestHarness, renderTestHook } from "@/lib/hookTestHarness"
import { authClient } from "./mcpViewAuthClient"
import * as host from "./mcpViewHost"
import { TopicSuggestionsMcpView } from "./TopicSuggestionsMcpView"
import { TOPIC_SUGGESTIONS_FIXTURE, TOPIC_SUGGESTIONS_INPUT } from "./topicSuggestionsFixtures"

// match the production MCP bundle: the audio player reads the host session
beforeEach(() => {
	spyOn(siteAuth, "authClient").mockReturnValue(authClient() as unknown as siteAuth.AuthClient)
})
afterEach(() => mock.restore())

// render the real MCP view controls with the host's links isolated from site navigation
async function renderPicker(openLink: (url: string) => void = () => {}): Promise<HookTestHarness<null>> {
	return renderTestHook(
		() => null,
		() => (
			<LinkBaseUrlContext.Provider value="http://localhost:5173/">
				<LinkOpenerContext.Provider value={openLink}>
					<TopicSuggestionsMcpView suggestions={TOPIC_SUGGESTIONS_FIXTURE} toolArguments={TOPIC_SUGGESTIONS_INPUT} />
				</LinkOpenerContext.Provider>
			</LinkBaseUrlContext.Provider>
		),
	)
}

test("checkboxes and standard selected pills update in both directions without sending", async () => {
	const call = spyOn(host, "callMcpViewTool")
	const hook = await renderPicker()
	try {
		// recommendations already have a pill, and checking another Topic adds its pill immediately
		const checkbox = hook.container.querySelector<HTMLInputElement>('input[aria-label="Agent infrastructure"]')
		if (!checkbox) {
			throw new Error("Missing Topic checkbox")
		}
		expect(hook.container.querySelector('[aria-label="Remove LLM evals and agent testing"]')).not.toBeNull()
		await act(async () => checkbox.click())
		const pill = hook.container.querySelector<HTMLButtonElement>('[aria-label="Remove Agent infrastructure"]')
		if (!pill) {
			throw new Error("Missing selected Topic pill")
		}
		expect(pill.parentElement?.className).toContain("py-1")
		expect(pill.parentElement?.className).toContain("shadow-raised")

		// removing the pill unchecks its row, and unchecking the row removes the pill
		await act(async () => pill.click())
		expect(checkbox.checked).toBe(false)
		await act(async () => checkbox.click())
		await act(async () => checkbox.click())
		expect(hook.container.querySelector('[aria-label="Remove Agent infrastructure"]')).toBeNull()
		expect(hook.container.textContent).toContain("Topics to share this chat with")
		expect(call).not.toHaveBeenCalled()
	} finally {
		await hook.close()
	}
})

test("loading replaces only results while the header, search, selected pills and actions remain visible", async () => {
	spyOn(host, "callMcpViewTool").mockImplementation(() => new Promise(() => {}))
	const hook = await renderPicker()
	try {
		// begin a cursor request without completing it
		const pageTwo = [...hook.container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "2",
		)
		if (!pageTwo) {
			throw new Error("Missing second page")
		}
		await act(async () => pageTwo.click())
		const results = hook.container.querySelector('[aria-label="Topic results"]')
		if (!results) {
			throw new Error("Missing results region")
		}
		expect(results.querySelector('[role="status"]')?.textContent).toContain("Steeping")
		for (const selector of [
			"header",
			'input[aria-label="Search your topics"]',
			'[aria-label="Topics to share this chat with"]',
			"footer",
		]) {
			expect(hook.container.querySelector(selector)?.closest(".invisible")).toBeNull()
		}
		expect(hook.container.querySelector('a[aria-label="Open CarlNotes in a new tab"]')?.getAttribute("target")).toBe(
			"_blank",
		)
		expect(hook.container.querySelector('a[aria-label="Open CarlNotes in a new tab"] svg')).not.toBeNull()
	} finally {
		await hook.close()
	}
})

test("the brand opens the connected site and the footer places outlined Send before highlighted new Topic", async () => {
	const openLink = mock(() => {})
	const hook = await renderPicker(openLink)
	try {
		// activate the real host link without leaving the MCP view
		const brand = hook.container.querySelector<HTMLAnchorElement>('a[aria-label="Open CarlNotes in a new tab"]')
		if (!brand) {
			throw new Error("Missing CarlNotes link")
		}
		await act(async () => brand.click())
		expect(openLink).toHaveBeenCalledWith("http://localhost:5173/")
		expect(brand.target).toBe("_blank")
		expect(brand.rel).toBe("noopener noreferrer")

		// preserve standard variants and action order on every viewport
		const buttons = [...hook.container.querySelectorAll("footer button")]
		expect(buttons[0]?.textContent).toStartWith("Send this chat to")
		expect(buttons[0]?.className).toContain("border")
		expect(buttons[1]?.textContent).toContain("Start a new topic for this chat")
		expect(buttons[1]?.className).toContain("bg-primary")
	} finally {
		await hook.close()
	}
})

// a private native backlink must preserve the full interactive picker
test("a Codex conversation reference renders checkboxes and preserves its exact send reference", async () => {
	const chat_url = "codex://threads/00000000-0000-4000-8000-000000000001"
	const call = spyOn(host, "callMcpViewTool").mockImplementation(() => new Promise(() => {}))
	const hook = await renderTestHook(
		() => null,
		() => (
			<LinkBaseUrlContext.Provider value="http://localhost:5173/">
				<LinkOpenerContext.Provider value={() => {}}>
					<TopicSuggestionsMcpView
						suggestions={TOPIC_SUGGESTIONS_FIXTURE}
						toolArguments={{ ...TOPIC_SUGGESTIONS_INPUT, chat_url }}
					/>
				</LinkOpenerContext.Provider>
			</LinkBaseUrlContext.Provider>
		),
	)
	try {
		expect(hook.container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0)
		expect(hook.container.textContent).not.toContain("Reopen the suggestions")
		const send = [...hook.container.querySelectorAll<HTMLButtonElement>("footer button")].find((button) =>
			button.textContent?.startsWith("Send this chat"),
		)
		await act(async () => send?.click())
		expect(call.mock.calls[0]?.[0]).toBe("send_to_topic")
		expect(call.mock.calls[0]?.[1]).toHaveProperty("chat_url", chat_url)
	} finally {
		await hook.close()
	}
})
