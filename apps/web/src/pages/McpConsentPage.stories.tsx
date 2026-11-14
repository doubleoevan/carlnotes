// the mcp consent page: the question for a client on a host CarlNotes knows, the warning for one on a host it does
// not know, and a client CarlNotes has no record of
import { fetchMcpConsentClient } from "@carlnotes/client/mcpClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, screen } from "storybook/test"
import { toOwnFrameDocs } from "../../.storybook/parameters"
import { findVisibleByRole, findVisibleByText } from "../../.storybook/play"
import { McpConsentPage } from "./McpConsentPage"

// the signed query Better Auth sends the page with, for a client that returns to Claude's own address
const CONSENT_QUERY = {
	client_id: "client-claude",
	redirect_uri: "https://claude.ai/api/mcp/auth_callback",
	sig: "story-signature",
}

// the line the page adds for a host CarlNotes does not know
const UNKNOWN_HOST_LINE = /a site CarlNotes doesn't know/

const meta = {
	title: "Pages/McpConsentPage",
	component: McpConsentPage,
	// the page renders for a signed-in user alone, and its open dialog gets its own frame on the docs page
	parameters: {
		session: "user",
		docs: toOwnFrameDocs(420),
		tanstack: { router: { route: { path: "/mcp/consent" }, query: CONSENT_QUERY } },
	},
	// the client route returns Claude on a host CarlNotes knows, unless a story says otherwise
	beforeEach: () => {
		mocked(fetchMcpConsentClient).mockResolvedValue({ name: "Claude", unknownRedirectHost: null })
	},
} satisfies Meta<typeof McpConsentPage>

export default meta
type Story = StoryObj<typeof meta>

// a client on a known AI app's host: the question and the two buttons, with no line about its host
export const KnownHost: Story = {
	play: async () => {
		await findVisibleByText("Share CarlNotes with Claude?")
		await expect(await findVisibleByRole("button", { name: "Allow" })).toBeEnabled()
		await expect(screen.queryByText(UNKNOWN_HOST_LINE)).toBeNull()
	},
}

// a client that named itself Claude and returns to a stranger's server: the page names that server's host
export const UnknownHost: Story = {
	parameters: {
		tanstack: {
			router: {
				route: { path: "/mcp/consent" },
				query: { ...CONSENT_QUERY, redirect_uri: "https://unknown.example/callback" },
			},
		},
	},
	beforeEach: () => {
		mocked(fetchMcpConsentClient).mockResolvedValue({ name: "Claude", unknownRedirectHost: "unknown.example" })
	},
	play: async () => {
		// the host is named under the question, and the user may still allow it
		await findVisibleByText(
			"Allowing shares CarlNotes with unknown.example, a site CarlNotes doesn't know. Allow only if you trust it.",
		)
		await expect(await findVisibleByRole("button", { name: "Allow" })).toBeEnabled()

		// the page asked about the redirect address in its own query
		await expect(mocked(fetchMcpConsentClient)).toHaveBeenCalledWith(
			"client-claude",
			"https://unknown.example/callback",
		)
	},
}

// a client id CarlNotes has no record of: the page says so and Allow stays off
export const UnknownClient: Story = {
	beforeEach: () => {
		mocked(fetchMcpConsentClient).mockResolvedValue(null)
	},
	play: async () => {
		await findVisibleByText("CarlNotes doesn't know this AI. Start again from your AI.")
		await expect(await findVisibleByRole("button", { name: "Allow" })).toBeDisabled()
	},
}
