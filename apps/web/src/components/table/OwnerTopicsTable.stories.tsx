// the topics table on the user's own profile, also opened as a subtable in the admin console: each topic's scans this
// month, subscribers, schedule, emails, and cost
import { fetchScanNote } from "@carlnotes/client/topicClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { OWNER_TOPIC_FIXTURES, SCAN_NOTE_FIXTURE } from "../../../.storybook/fixtures/topics"
import { toTableBodyDecorator } from "../../../.storybook/tableDecorators"
import { OwnerTopicsTable, TopicsSubtableRow } from "./OwnerTopicsTable"

// how many columns the admin users table has, which a subtable row spans
const ADMIN_USERS_TABLE_COLUMN_COUNT = 14

const meta = {
	title: "Table/OwnerTopicsTable",
	component: OwnerTopicsTable,
	args: { topics: OWNER_TOPIC_FIXTURES, onReloadPage: fn() },
	argTypes: {
		className: { control: "text" },
		onReloadPage: { control: false },
	},
	parameters: { session: "user" },
	// a scan time's popover loads its scan note, with its source results chart, from the mocked topic client
	beforeEach: () => {
		mocked(fetchScanNote).mockResolvedValue(SCAN_NOTE_FIXTURE)
	},
} satisfies Meta<typeof OwnerTopicsTable>

export default meta
type Story = StoryObj<typeof meta>

// three owned topics with their totals line, one with a podcast episode's play button beside its name
export const Default: Story = {}

// the first topic's scans this month, opened by a click on its cost
export const ScansOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "$4.20" }))
	},
}

// the sunken subtable the admin console opens under a user's row, in the admin users table's body at that table's width
export const InAdminSubtable: Story = {
	parameters: { session: "admin" },
	decorators: [toTableBodyDecorator("min-w-3xl [&_tbody_tr:last-child>*]:border-b-0")],
	render: (args) => (
		<TopicsSubtableRow topics={args.topics} colSpan={ADMIN_USERS_TABLE_COLUMN_COUNT} onReloadPage={args.onReloadPage} />
	),
}

// the line an admin subtable shows if the user's topics load empty
export const Empty: Story = { ...InAdminSubtable, args: { topics: [] } }
