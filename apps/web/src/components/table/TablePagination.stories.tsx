// the pagination footer under a table: the rows select on the left and the pager on the right, and the scripted
// footer that shows only with JavaScript
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { type RelatedTopic, RelatedTopicsSection } from "@/components/topic/RelatedTopicsSection"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { TableCard } from "./TableCard"
import { PAGE_SIZES, ScriptedTablePagination, SMALLEST_PAGE_SIZE, TablePagination } from "./TablePagination"

const meta = {
	title: "Table/TablePagination",
	component: TablePagination,
	subcomponents: { ScriptedTablePagination },
	args: { page: 0, pageCount: 5, pageSize: 10, rowCount: 42, setPage: fn(), setPageSize: fn() },
	argTypes: {
		page: { control: { type: "number", min: 0 } },
		pageCount: { control: { type: "number", min: 1 } },
		pageSize: { control: "select", options: PAGE_SIZES },
		rowCount: { control: { type: "number", min: 0 } },
		setPage: { control: false },
		setPageSize: { control: false },
	},
	// the footer is the last child of a table's card and spans the card's full width
	render: (args) => (
		<TableCard>
			<TablePagination {...args} />
		</TableCard>
	),
} satisfies Meta<typeof TablePagination>

export default meta
type Story = StoryObj<typeof meta>

// the first of five pages, its previous button disabled
export const FirstPage: Story = {}

// a page in the middle, both buttons enabled
export const MiddlePage: Story = { args: { page: 2 } }

// the last of five pages, its next button disabled
export const LastPage: Story = { args: { page: 4 } }

// twelve rows at ten a page, two pages
export const TwoPages: Story = { args: { rowCount: 12, pageCount: 2, page: 1 } }

// hundreds of rows at fifty a page
export const ManyPages: Story = { args: { rowCount: 1240, pageSize: 50, pageCount: 25, page: 11 } }

// rows that fit on one page, the rows select alone
export const OnePage: Story = { args: { rowCount: 8, pageCount: 1 } }

// no more rows than the smallest page size, where the footer renders nothing
export const NoFooter: Story = { args: { rowCount: SMALLEST_PAGE_SIZE, pageCount: 1 } }

// the scripted footer in a browser with JavaScript, where it shows
export const Scripted: Story = {
	render: (args) => (
		<TableCard>
			<ScriptedTablePagination {...args} />
		</TableCard>
	),
}

// the scripted footer without JavaScript, where it stays hidden
export const ScriptedWithoutJavaScript: Story = {
	...Scripted,
	// the docs page's inline stories share one html element, so the docs page gives this story its own frame to keep
	// the scripted class on the rest
	parameters: { hasJavaScript: false, docs: toOwnFrameDocs(66) },
}

// the topic page's related topics table, paged five rows at a time by the real pagination hook
export const RelatedTopicsTable: Story = {
	parameters: { controls: { disable: true } },
	render: () => <RelatedTopicsSection relatedTopics={RELATED_TOPICS} />,
}

// the names the paged table's topics cycle through
const TOPIC_NAME_STEMS = [
	"LLM tooling",
	"Battery chemistry",
	"Open source licensing",
	"Urban cycling",
	"Sleep research",
]

// twenty-three related topics, five pages at the smallest page size
const RELATED_TOPICS: RelatedTopic[] = Array.from({ length: 23 }, (_, i) => ({
	id: `topic-related-${i + 1}`,
	name: `${TOPIC_NAME_STEMS[i % TOPIC_NAME_STEMS.length]} ${Math.floor(i / TOPIC_NAME_STEMS.length) + 1}`,
	latestPodcastEpisode: null,
}))
