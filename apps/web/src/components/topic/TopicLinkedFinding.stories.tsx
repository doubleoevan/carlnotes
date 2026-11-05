import { fetchTopicFindingLinkPreview } from "@carlnotes/client/topicFindingClient"
import { toTestTopicFinding, toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TopicLinkedFinding, type TopicLinkedFindingDetailsProps } from "@carlnotes/core/components/TopicLinkedFinding"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { Popover, PopoverAnchor } from "@/components/primitives/popover"
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
	beforeEach: () => {
		mocked(fetchTopicFindingLinkPreview).mockResolvedValue(null)
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
		<Popover
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					onClose()
				}
			}}
		>
			<PopoverAnchor className="fixed top-1/3 left-1/2" />
			<TopicResourceInfo
				topic={topic}
				resource={resource}
				topicFindingRank={null}
				isRatable={false}
				isBookmarkable={false}
				topicFeedHandlers={topicFeedHandlers}
			/>
		</Popover>
	)
}
