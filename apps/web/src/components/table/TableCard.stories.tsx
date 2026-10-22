// the raised card every table sits in: the surface, the border, and the padding a table's scroll box reaches into
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ONE_PAGE_TABLE_CARD_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { TableCard } from "./TableCard"

// the topics the sample table lists
const SAMPLE_TOPICS = [
	{ name: "LLM tooling", findingCount: 42, updatedLabel: "Oct 2026" },
	{ name: "Battery chemistry", findingCount: 7, updatedLabel: "Sep 2026" },
	{ name: "Open source licensing", findingCount: 19, updatedLabel: "Aug 2026" },
]

// a table written the way the app writes one inside its card
const sampleTable = (
	<div className={TABLE_SCROLL_CLASS}>
		<table className={TABLE_CLASS}>
			<thead className={TABLE_HEAD_CLASS}>
				<tr>
					<th className="py-2 pr-4 font-normal">Topic</th>
					<th className="py-2 pr-4 font-normal">Findings</th>
					<th className="py-2 pr-4 font-normal">Updated</th>
				</tr>
			</thead>
			<tbody>
				{SAMPLE_TOPICS.map((sampleTopic) => (
					<tr key={sampleTopic.name} className="border-b">
						<td className="py-2 pr-4">{sampleTopic.name}</td>
						<td className="py-2 pr-4">{sampleTopic.findingCount}</td>
						<td className="text-muted-foreground py-2 pr-4">{sampleTopic.updatedLabel}</td>
					</tr>
				))}
			</tbody>
		</table>
	</div>
)

const meta = {
	title: "Table/TableCard",
	component: TableCard,
	args: { children: sampleTable },
	argTypes: {
		className: { control: "text" },
		children: { control: false },
	},
} satisfies Meta<typeof TableCard>

export default meta
type Story = StoryObj<typeof meta>

// a table in its card, with padding under the last row
export const WithTable: Story = {}

// a one-page table whose card ends at its last row
export const OnePageTable: Story = { args: { className: ONE_PAGE_TABLE_CARD_CLASS } }

// the empty state a page writes in the card in place of a table
export const EmptyState: Story = {
	args: { children: <p className="text-muted-foreground py-2 text-sm">No topics on this team yet.</p> },
}
