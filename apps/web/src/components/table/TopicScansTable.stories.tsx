// a topic's scans this month with what each cost, which a topic row's cost opens: each scan's date, what it read and
// kept, how long it took, and its cost. a scan's time opens its recap
import { fetchScanNote } from "@carlnotes/client/topicClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { OWNER_TOPIC_FIXTURES, SCAN_NOTE_FIXTURE } from "../../../.storybook/fixtures/topics"
import { TopicScansTable } from "./TopicScansTable"

// the first fixture topic, whose scans this month the table lists
const [STORY_TOPIC] = OWNER_TOPIC_FIXTURES
if (!STORY_TOPIC) {
	throw new Error("the owner topic fixtures are empty")
}

const meta = {
	title: "Table/TopicScansTable",
	component: TopicScansTable,
	args: { scans: STORY_TOPIC.scans, topic: STORY_TOPIC },
	argTypes: {
		scans: { control: "object" },
		topic: { control: "object" },
	},
	parameters: { session: "user" },
	// a scan time's popover loads its scan note from the mocked topic client
	beforeEach: () => {
		mocked(fetchScanNote).mockResolvedValue(SCAN_NOTE_FIXTURE)
	},
} satisfies Meta<typeof TopicScansTable>

export default meta
type Story = StoryObj<typeof meta>

// the topic's scans this month with their totals line
export const Default: Story = {}

// a topic that has not scanned this month
export const NoScans: Story = {
	args: { scans: [] },
}
