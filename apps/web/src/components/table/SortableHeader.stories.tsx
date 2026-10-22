// the sortable column header: a button that sorts a table by its column, an arrow on the active column and a faint
// hint on the rest
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { ONE_PAGE_TABLE_CARD_CLASS } from "@/lib/styleClasses"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { type RowSort, SortableHeader, useRowSort } from "./SortableHeader"

const meta = {
	title: "Table/SortableHeader",
	component: SortableHeader,
	args: { sort: toRowSort(null), sortKey: "topic", label: "Topic", className: "py-2 pr-4" },
	argTypes: {
		sort: { control: false },
		sortKey: { control: "text" },
		label: { control: "text" },
		tooltip: { control: "text" },
		className: { control: "text" },
	},
	// a header cell renders first in a table's head row, with an empty column after it like the users table's last one
	render: (args) => (
		<StoryTable
			head={
				<tr>
					<SortableHeader {...args} />
					<th className="py-2" />
				</tr>
			}
		/>
	),
} satisfies Meta<typeof SortableHeader>

export default meta
type Story = StoryObj<typeof meta>

// a column the table is not sorted by, with the faint up and down hint
export const Unsorted: Story = {}

// the active column sorted ascending, with an up arrow
export const Ascending: Story = { args: { sort: toRowSort("topic") } }

// the active column sorted descending, with a down arrow
export const Descending: Story = { args: { sort: toRowSort("topic", true) } }

// a shortened label whose tooltip names the column in full
export const WithTooltip: Story = {
	args: { sortKey: "kept", label: "Kept / reviewed", tooltip: "Carl reviewed and kept these findings" },
}

// a whole table whose headers sort its rows, clicking a column twice to flip the direction
export const SortingATable: Story = {
	parameters: { controls: { disable: true } },
	render: () => <SortedTopicsTable />,
}

// the sort state of a table sorted by one column, or by none
function toRowSort(sortKey: string | null, isDescending = false): RowSort {
	return { sortKey, isDescending, toggleSort: fn() }
}

// one row of the sorted table
type TopicRow = { name: string; findingCount: number }

// the topics the sorted table lists, in the server's order
const TOPIC_ROWS: TopicRow[] = [
	{ name: "LLM tooling", findingCount: 42 },
	{ name: "Battery chemistry", findingCount: 7 },
	{ name: "Open source licensing", findingCount: 19 },
	{ name: "Urban cycling", findingCount: 0 },
]

// the sort accessors for the sorted table's columns
const topicRowSortValues = {
	topic: (topicRow: TopicRow) => topicRow.name,
	findings: (topicRow: TopicRow) => topicRow.findingCount,
}

// a small topics table whose headers drive the real row sort, in the card of a table that fits one page
function SortedTopicsTable() {
	const { sortedRows, ...sort } = useRowSort(TOPIC_ROWS, topicRowSortValues)
	return (
		<StoryTable
			cardClassName={ONE_PAGE_TABLE_CARD_CLASS}
			head={
				<tr>
					<SortableHeader sort={sort} sortKey="topic" label="Topic" className="py-2 pr-4" />
					<SortableHeader
						sort={sort}
						sortKey="findings"
						label="Findings"
						tooltip="Findings kept across every Scan"
						className="py-2 pr-4"
					/>
				</tr>
			}
		>
			{sortedRows.map((topicRow) => (
				<tr key={topicRow.name} className="border-b">
					<td className="py-2 pr-4">{topicRow.name}</td>
					<td className="py-2 pr-4">{topicRow.findingCount}</td>
				</tr>
			))}
		</StoryTable>
	)
}
