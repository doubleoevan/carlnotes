import { toTestTopicFeed, toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicResource } from "./TopicResource"
import { FEED_WEB_REFERENCES, STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"

// each story uses the global Latte and Dark roast controls and the system text size
const meta: Meta<typeof TopicResource> = {
	title: "Topic/TopicResource",
	component: TopicResource,
	parameters: { webReference: FEED_WEB_REFERENCES.resource },
	decorators: [
		(Story) => (
			<View className="rounded-lg border border-separator bg-card px-3 py-1 shadow-raised">
				<Story />
			</View>
		),
	],
	args: {
		resource: toTestTopicFinding(),
		topic: toTestTopicFeed(),
		topicFeedHandlers: STORY_TOPIC_FEED_HANDLERS,
		linkPreview: null,
		onSendFeedback: async () => undefined,
	},
}
export default meta
type Story = StoryObj<typeof meta>

// independent saved and permission states
export const Unread: Story = {}
export const Consumed: Story = { args: { resource: toTestTopicFinding({ isConsumed: true }) } }
export const Bookmarked: Story = { args: { resource: toTestTopicFinding({ isBookmarked: true }) } }
export const TeamBookmarked: Story = {
	args: {
		resource: toTestTopicFinding({
			teamBookmarks: [{ userId: "teammate", username: "espresso", avatarSource: null, avatarVersion: null }],
		}),
	},
}
export const UpRated: Story = { args: { resource: toTestTopicFinding({ rating: "up" }) } }
export const Pending: Story = { args: { resource: toTestTopicFinding({ isBookmarked: true }), isPending: true } }
export const Rollback: Story = { args: { resource: toTestTopicFinding({ isBookmarked: false }), isPending: false } }
export const ReadOnly: Story = {
	args: { topic: toTestTopicFeed({ isTopicOwner: false, isTeamMember: false, canRate: false }) },
}

// missing and unsuccessful images retain the kind and title fallback
export const MissingMetadata: Story = {
	args: { resource: toTestTopicFinding({ title: null, source: null, publishedAt: null, faviconPath: null }) },
}
export const FailedImage: Story = { args: { resource: toTestTopicFinding({ faviconPath: "/missing-favicon.png" }) } }
export const LongContent: Story = {
	args: {
		resource: toTestTopicFinding({
			title:
				"A careful look at how a small change to the temperature, grind, and water changes every cup you make at home",
			relevanceExplanation: "A practical **review** with [links](https://example.com) and many details. ".repeat(15),
		}),
	},
}
