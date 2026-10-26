import { resourceKinds } from "@carlnotes/contracts/enums"
import { toTestTopicFeed, toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { selectTopicFindings } from "@carlnotes/core/lib/topicFeed"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicFindingsSection } from "./TopicFindingsSection"
import { FEED_WEB_REFERENCES, STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"

// the Topic story delivers more findings than Home shows
const meta: Meta<typeof TopicFindingsSection> = {
	title: "Topic/TopicFindingsSection",
	component: TopicFindingsSection,
	parameters: { webReference: FEED_WEB_REFERENCES.topic },
	args: {
		topic: toTestTopicFeed(),
		findings: Array.from({ length: 12 }, (_, i) =>
			toTestTopicFinding({ findingId: `finding-${i}`, title: `Coffee finding ${i + 1}` }),
		),
		state: { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [], isReheating: false },
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

// shared selection removes the down-rated finding before any card is recycled
export const AllFindings: Story = {}
export const Empty: Story = { args: { findings: [] } }
export const RemovedDownRated: Story = {
	args: {
		findings: selectTopicFindings({
			findings: [toTestTopicFinding({ rating: "down" })],
			resourceKinds: new Set(resourceKinds),
			sort: "relevant",
			findingFilter: "all",
		}),
	},
}
