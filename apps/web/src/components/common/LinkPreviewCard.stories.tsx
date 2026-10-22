// the link preview card: a linked page's host, title, description, and image under a chat message, and its loading note
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LinkPreviewCard, LinkPreviewLoading } from "./LinkPreviewCard"

// an article's card, its image and its host's favicon served from this origin
const ARTICLE_LINK_PREVIEW: ChatLinkPreview = {
	url: "https://example.com/articles/llm-tooling-for-small-teams",
	title: "LLM tooling for small teams",
	description: "Which evaluation, tracing, and prompt tools held up after a quarter of daily use.",
	imagePath: "/opengraph-image.png",
	faviconPath: "/favicon-96x96.png",
	youtubeVideoId: null,
}

const meta = {
	title: "Common/LinkPreviewCard",
	component: LinkPreviewCard,
	args: { linkPreview: ARTICLE_LINK_PREVIEW, isUserContent: false },
	argTypes: {
		linkPreview: { control: "object" },
		isUserContent: { control: "boolean" },
		className: { control: "text" },
	},
	// the chat panel and the resource info popover, which share the card fill
	parameters: { surface: "card" },
	// the chat message's column, which keeps the card at the column's left edge and no wider than the docked panel
	decorators: [
		(Story) => (
			<div className="flex w-full flex-col items-start" style={{ maxWidth: 460 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof LinkPreviewCard>

export default meta
type Story = StoryObj<typeof meta>

// an article with its image over the text
export const Article: Story = {}

// a page with no stored image or favicon, which shows the globe beside its host
export const TextOnly: Story = {
	args: { linkPreview: { ...ARTICLE_LINK_PREVIEW, imagePath: null, faviconPath: null } },
}

// a YouTube video, whose thumbnail plays the video in place
export const YoutubeVideo: Story = {
	args: {
		linkPreview: {
			url: "https://www.youtube.com/watch?v=storyVideo1",
			title: "How a Scan picks its Findings",
			description: "A walk through one Topic's Scan, from its Sources to the Findings it keeps.",
			imagePath: "/topic-tutorial-video-thumbnail.webp",
			faviconPath: null,
			youtubeVideoId: "storyVideo1",
		},
	},
}

// a long title and description, each held to two lines
export const LongText: Story = {
	args: {
		linkPreview: {
			...ARTICLE_LINK_PREVIEW,
			imagePath: null,
			title:
				"Everything we learned running LLM tooling in production for a year, from evaluation harnesses to tracing, prompt versioning, and the budgets that kept it all affordable",
			description:
				"A long read on the tools that stayed, the ones that left, and why the boring choices won. It covers evaluation, tracing, prompt storage, model routing, and the monthly budget review that keeps the bill flat.",
		},
	},
}

// the loading note while the card is still fetching, at the column's left edge under Carl's answer
export const Loading: Story = { render: () => <LinkPreviewLoading /> }
