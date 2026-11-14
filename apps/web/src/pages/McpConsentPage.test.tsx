// mcp consent page tests: the page asks the client route about the redirect address in its own query, and shows the
// line about the host its answer returns to only if CarlNotes does not know that host
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import * as mcpClient from "@carlnotes/client/mcpClient"
import type { McpConsentClient } from "@carlnotes/contracts/aiAgentIdentity"
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router"
import * as dialog from "@/components/primitives/dialog"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"
import { McpConsentPage } from "./McpConsentPage"

// the signed-in user's session, one object for every render so the page fetches its client once
const SESSION = { user: { id: "user-1" } }

// the words of the line the page adds for a host CarlNotes does not know
const UNKNOWN_HOST_TEXT = "a site CarlNotes doesn't know"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// the page's text once its client loaded, and each call the page made to the client route
type RenderedMcpConsentPage = { pageText: string; fetchMcpConsentClientCalls: unknown[][] }

// mount the consent page for a signed-in user at a signed query that names the redirect address, with the client
// route returning the given client, and read the page once it asks its question
async function renderMcpConsentPage(
	mcpConsentClient: McpConsentClient,
	redirectUri: string,
): Promise<RenderedMcpConsentPage> {
	// a signed-in user, and the client the client route returns
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: SESSION, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
	const fetchMcpConsentClientSpy = spyOn(mcpClient, "fetchMcpConsentClient").mockResolvedValue(mcpConsentClient)

	// render the dialog's content in place. the dialog's portal never mounts in the harness, whose document is created
	// after radix loads
	spyOn(dialog, "DialogContent").mockImplementation(({ children }) => <div>{children}</div>)

	// a router whose location is the consent page's signed query
	const consentQuery = new URLSearchParams({ client_id: "client-claude", redirect_uri: redirectUri, sig: "signature" })
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: [`/mcp/consent?${consentQuery}`] }),
	})

	// mount the page under the router's context
	const harness = await renderTestHook(
		() => null,
		() => (
			<RouterContextProvider router={router}>
				<McpConsentPage />
			</RouterContextProvider>
		),
	)

	// read the page once its question names the loaded client, then close the render
	const readPageText = (): string => harness.container.textContent ?? ""
	try {
		await waitForHook(() => readPageText().includes(`Share CarlNotes with ${mcpConsentClient.name}?`))
		return { pageText: readPageText(), fetchMcpConsentClientCalls: fetchMcpConsentClientSpy.mock.calls }
	} finally {
		await harness.close()
	}
}

// a client that named itself after a known AI app and returns to a stranger's server: the page asks the client route
// about that server's address, and names its host under the question
test("the consent page asks about its query's redirect address, and names a host CarlNotes does not know", async () => {
	const { pageText, fetchMcpConsentClientCalls } = await renderMcpConsentPage(
		{ name: "Claude", unknownRedirectHost: "unknown.example" },
		"https://unknown.example/callback",
	)
	expect(fetchMcpConsentClientCalls).toEqual([["client-claude", "https://unknown.example/callback"]])
	expect(pageText).toContain(
		"Allowing shares CarlNotes with unknown.example, a site CarlNotes doesn't know. Allow only if you trust it.",
	)
})

// a client whose redirect address is on a host CarlNotes knows: the page asks about that address too, and shows its
// question with no line about the host
test("the consent page shows no line about a host CarlNotes knows", async () => {
	const { pageText, fetchMcpConsentClientCalls } = await renderMcpConsentPage(
		{ name: "Claude", unknownRedirectHost: null },
		"https://claude.ai/api/mcp/auth_callback",
	)
	expect(fetchMcpConsentClientCalls).toEqual([["client-claude", "https://claude.ai/api/mcp/auth_callback"]])
	expect(pageText).toContain("Share CarlNotes with Claude?")
	expect(pageText).not.toContain(UNKNOWN_HOST_TEXT)
})
