// the link every feature link goes through, which renders a router link, a plain anchor, or a new tab by its href
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { AnchorLink } from "./AnchorLink"

const meta = {
	title: "Common/AnchorLink",
	component: AnchorLink,
	args: {
		href: "/topics",
		children: "Your topics",
		className: STANDALONE_LINK_CLASS,
		isUserContent: false,
		isNewTab: false,
	},
	argTypes: {
		href: { control: "text" },
		children: { control: "text" },
		className: { control: "text" },
		isUserContent: { control: "boolean" },
		isNewTab: { control: "boolean" },
	},
	// the tables, cards, dialogs, and chat panel that show most feature links
	parameters: { surface: "card" },
} satisfies Meta<typeof AnchorLink>

export default meta
type Story = StoryObj<typeof meta>

// the footer's muted row on the page background, which shows the links to the paths the server renders
const FOOTER_LINK_STORY: Pick<Story, "parameters" | "render"> = {
	parameters: { surface: "page" },
	render: (args) => (
		<p className="text-muted-foreground text-sm">
			<AnchorLink {...args} />
		</p>
	),
}

// an app route, which navigates through the router with no page load
export const InternalRoute: Story = {}

// a path the server renders itself, like the releases, which loads as a full page in the same tab, as the footer
// shows it
export const ServerPath: Story = {
	...FOOTER_LINK_STORY,
	args: { href: "/releases", children: "Releases" },
}

// a server path with isNewTab, like the docs, which opens in a new tab with no opener and no referrer, as the footer
// shows it
export const NewTabServerPath: Story = {
	...FOOTER_LINK_STORY,
	args: { href: "/docs", children: "What CarlNotes Is", isNewTab: true },
}

// another site, which opens in a new tab with no opener and no referrer
export const External: Story = {
	args: { href: "https://example.com/llm-tooling-roundup", children: "LLM tooling roundup" },
}

// a link a user wrote, which opens in a new tab marked as user content
export const UserContent: Story = {
	args: { href: "https://example.com/vienna-notes", children: "Vienna's notes on LLM tooling", isUserContent: true },
}

// a mail link, which opens the mail client in the same tab. the terms and privacy pages underline it in a sentence on
// the page background
export const UriScheme: Story = {
	args: { href: "mailto:support@example.com", children: "support@example.com", className: "sentence-link" },
	parameters: { surface: "page" },
	render: (args) => (
		<p className="text-sm leading-relaxed">
			Email <AnchorLink {...args} /> and we will respond within 30 days.
		</p>
	),
}

// a data url, which renders the link text with nothing to follow
export const NonWebScheme: Story = { args: { href: "data:text/plain,LLM%20tooling", children: "LLM tooling" } }
