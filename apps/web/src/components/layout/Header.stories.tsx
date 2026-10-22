// the global header: the brand, the theme toggle, a visitor's links or the user's avatar menu, and the home page hero
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"
import { mockTopicFeed } from "../../../.storybook/fixtures/topicFeed"
import { seedWaitingUpdates } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { Header } from "./Header"

const meta = {
	title: "Layout/Header",
	component: Header,
	// the home link reloads the topic feed, so the header renders inside the TopicFeedProvider. the provider reads the
	// route, so it renders here, inside the story's router, instead of in a decorator, which wraps outside the router
	render: () => (
		<TopicFeedProvider>
			<Header />
		</TopicFeedProvider>
	),
	beforeEach: mockTopicFeed,
	parameters: { layout: "fullscreen", tanstack: { router: { route: { path: "/" } } } },
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

// a visitor on the home page: the top bar with log in and sign up, over the hero with Carl and his pitch
export const VisitorHome: Story = {}

// a visitor on another page: no hero, the video's button beside the logo, and Plans marked as the current page
export const VisitorOnPlans: Story = { parameters: { tanstack: { router: { route: { path: "/plans" } } } } }

// a signed-in user: no hero, and the avatar menu in place of the visitor's links
export const User: Story = { parameters: { session: "user" } }

// a signed-in user with waiting updates, summed into one badge on the avatar
export const UserWithUpdates: Story = {
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { session: "user", docs: toOwnFrameDocs(103) },
	beforeEach: seedWaitingUpdates,
}

// a visitor on a 375-pixel-wide phone: the hamburger menu replaces the links, and the headline spans above Carl
export const VisitorPhone: Story = {
	// the docs page is wider than a phone, so the story stays off it
	tags: ["!autodocs"],
	globals: PHONE_VIEWPORT_GLOBALS,
}
