// the app shell every page renders in: the header, the search bar, the routed page, the footer, and the chat pill
import { fetchTopicInviteBadges } from "@carlnotes/client/activityClient"
import { fetchChatMentionCount, fetchChatRooms } from "@carlnotes/client/chatRoomClient"
import { fetchNoteBadges } from "@carlnotes/client/noteClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { createRootRoute, createRoute } from "@tanstack/react-router"
import { mocked } from "storybook/test"
import { HomePage } from "@/pages/HomePage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"
import { mockTopicFeed, mockUserTopicFeed } from "../../../.storybook/fixtures/topicFeed"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { Layout } from "./Layout"

// the chat panel's badge poll for a signed-in user, with nothing waiting
function mockEmptyBadgePoll(): void {
	mocked(fetchChatRooms).mockResolvedValue([])
	mocked(fetchChatMentionCount).mockResolvedValue(0)
	mocked(fetchNoteBadges).mockResolvedValue([])
	mocked(fetchTopicInviteBadges).mockResolvedValue([])
}

// the routes as the app nests them: the shell's layout route, with the home page as its index route in the outlet
const storyRootRoute = createRootRoute()
const layoutRoute = createRoute({ getParentRoute: () => storyRootRoute, id: "_layout" })
const homeRoute = createRoute({ getParentRoute: () => layoutRoute, path: "/", component: HomePage })
storyRootRoute.addChildren([layoutRoute.addChildren([homeRoute])])

const meta = {
	title: "Layout/Layout",
	component: Layout,
	// the shell renders inside the TopicFeedProvider, as the _layout route renders it. the provider reads the route, so
	// it renders here, inside the story's router, instead of in a decorator, which wraps outside the router
	render: () => (
		<TopicFeedProvider>
			<Layout />
		</TopicFeedProvider>
	),
	beforeEach: [mockTopicFeed, mockEmptyBadgePoll],
	parameters: {
		layout: "fullscreen",
		// the story renders as the layout route, so its outlet shows the home page at "/"
		tanstack: { router: { route: layoutRoute } },
		// the chat pill is fixed to the window, so each shell gets its own docs frame on the page background
		docs: toOwnFrameDocs(900),
	},
} satisfies Meta<typeof Layout>

export default meta
type Story = StoryObj<typeof meta>

// a visitor on the home page: the hero, the search bar over its edge, the featured topics, the footer, and the chat pill
export const Visitor: Story = {}

// a signed-in user on the home page: no hero, the avatar menu, their own and subscribed topics above the featured ones,
// and the chat pill with nothing waiting
export const User: Story = { parameters: { session: "user" }, beforeEach: mockUserTopicFeed }
