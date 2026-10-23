// the admin console's table of a topic's subscribers, read when the table opens, with each subscriber's account,
// subscription, and the topic's emails to them
import { fetchAdminTopicSubscribers } from "@carlnotes/client/billingClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { TOPIC_SUBSCRIBER_FIXTURES } from "../../../.storybook/fixtures/adminUsers"
import { TopicSubscribersTable } from "./TopicSubscribersTable"

const meta = {
	title: "Table/TopicSubscribersTable",
	component: TopicSubscribersTable,
	args: { topicId: "topic-llm-tooling" },
	parameters: { session: "admin" },
	// the subscribers load from the mocked billing client
	beforeEach: () => {
		mocked(fetchAdminTopicSubscribers).mockResolvedValue(TOPIC_SUBSCRIBER_FIXTURES)
	},
} satisfies Meta<typeof TopicSubscribersTable>

export default meta
type Story = StoryObj<typeof meta>

// three subscribers, newest first, one with the topic's emails off and one with no recorded login
export const Default: Story = {}

// a read that never settles shows the loading mug
export const Loading: Story = {
	beforeEach: () => {
		mocked(fetchAdminTopicSubscribers).mockReturnValue(new Promise(() => {}))
	},
}

// a failed read says so in place
export const LoadFailed: Story = {
	beforeEach: () => {
		mocked(fetchAdminTopicSubscribers).mockRejectedValue(new Error("admin topic subscribers failed: 500"))
	},
}
