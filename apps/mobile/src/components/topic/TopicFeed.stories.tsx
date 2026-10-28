import {
	toTestTopicFeed,
	toTestTopicFeedResponse,
	toTestTopicFinding,
} from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicFeed } from "./TopicFeed"
import { FEED_WEB_REFERENCES, STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"

// a bounded viewport exercises recycling and five-finding continuation
const meta: Meta<typeof TopicFeed> = {
	title: "Topic/TopicFeed",
	component: TopicFeed,
	parameters: { webReference: FEED_WEB_REFERENCES.feed },
	args: {
		topicFeed: toTestTopicFeedResponse(),
		state: { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [], isReheating: false },
		onRefresh: () => undefined,
	},
	decorators: [
		(Story) => (
			<View style={{ width: "100%", flex: 1 }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

// own, empty, followed, and repeated-topic sections
export const Yours: Story = {}
export const Visitor: Story = {
	args: {
		topicFeed: {
			...toTestTopicFeedResponse([]),
			sections: [
				{ key: "featured", topics: [toTestTopicFeed({ isTopicOwner: false, isTeamMember: false, canRate: false })] },
				{ key: "popular", topics: [] },
			],
		},
	},
}
export const Empty: Story = { args: { topicFeed: toTestTopicFeedResponse([]) } }
export const Followed: Story = {
	args: {
		topicFeed: {
			...toTestTopicFeedResponse([]),
			sections: [
				{ key: "yours", topics: [] },
				{ key: "subscribed", topics: [toTestTopicFeed({ isTopicOwner: false, canRate: false })] },
				{ key: "featured", topics: [] },
				{ key: "popular", topics: [] },
			],
		},
	},
}
export const LongFeed: Story = {
	args: {
		topicFeed: toTestTopicFeedResponse(
			Array.from({ length: 30 }, (_, i) =>
				toTestTopicFeed({
					id: `topic-${i}`,
					name: `Coffee notes ${i + 1}`,
					findings: Array.from({ length: 8 }, (_, findingIndex) =>
						toTestTopicFinding({ findingId: `${i}-${findingIndex}` }),
					),
				}),
			),
		),
	},
}

// expose all browsing controls and attribution without leaving the feed
export const Browsing: Story = {
	args: {
		topicFeed: toTestTopicFeedResponse([
			toTestTopicFeed({
				name: "Better coffee at home",
				newCount: 20,
				teamLink: { teamId: "coffee", name: "Coffee's for Closers", avatarVersion: null },
				tags: ["coffee", "brewing"],
				findings: Array.from({ length: 21 }, (_, i) =>
					toTestTopicFinding({ findingId: `coffee-${i}`, title: `Coffee finding ${i + 1}` }),
				),
			}),
			toTestTopicFeed({
				id: "tea",
				name: "Tea for two",
				newCount: 0,
				owner: { userId: "reader", username: "TeaReader", avatarSource: "generated", avatarVersion: null },
				tags: ["tea"],
			}),
		]),
	},
}
