import { toTestTopicFinding, toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TopicLinkedFinding, type TopicLinkedFindingDetailsProps } from "@carlnotes/core/components/TopicLinkedFinding"
import type { Meta, StoryObj } from "@storybook/react-native"
import { fn } from "storybook/test"
import { TopicResourceInfo } from "./TopicResourceInfo"

// resolve the real shared selection against a fictional authorized Topic
const finding = toTestTopicFinding()
const topic = toTestTopicResponse({ findings: [finding] })
const meta = {
	title: "Topic/TopicLinkedFinding",
	component: TopicLinkedFinding,
	parameters: { webReference: "apps/web/src/components/topic/TopicLinkedFinding.stories.tsx at 375px" },
	args: {
		topic,
		findingId: finding.findingId,
		Details: FindingDetails,
		onClose: fn(),
		topicFeedHandlers: {
			openTopicFinding: fn(),
			consumeTopicFinding: fn(),
			rateTopicFinding: fn(),
			bookmarkTopicFinding: fn(),
		},
	},
} satisfies Meta<typeof TopicLinkedFinding>
export default meta
type Story = StoryObj<typeof meta>
export const Found: Story = {}
export const Unavailable: Story = { args: { findingId: "unavailable" } }
export const NoSelection: Story = { args: { findingId: null } }

// use the existing platform Finding details with local write handlers
function FindingDetails({ topic, resource, onClose, topicFeedHandlers }: TopicLinkedFindingDetailsProps) {
	return (
		<TopicResourceInfo
			topic={topic}
			resource={resource}
			onClose={onClose}
			topicFeedHandlers={topicFeedHandlers}
			isSignedIn={false}
			linkPreview={null}
			onSendFeedback={async () => undefined}
		/>
	)
}
