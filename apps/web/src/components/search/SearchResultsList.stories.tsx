// the site search's results that the search page and the mcp search card render: every kind of row, listed as the
// feed lists its findings, with the numbered pages under them
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { SEARCH_PAGE_FIXTURE, SEARCH_ROW_FIXTURES } from "../../../.storybook/fixtures/search"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { SearchResultsList } from "./SearchResultsList"

const meta = {
	title: "Search/SearchResultsList",
	component: SearchResultsList,
	args: {
		searchPage: SEARCH_PAGE_FIXTURE,
		searchPagination: { onOpenPage: fn() },
		topicFeedHandlers: {
			openTopicFinding: fn(),
			consumeTopicFinding: fn(),
			rateTopicFinding: fn(),
			bookmarkTopicFinding: fn(),
		},
	},
	argTypes: {
		searchPage: { control: "object" },
		searchPagination: { control: false },
		loadingPageNumber: { control: "number" },
		topicFeedHandlers: { control: false },
		renderTopicAction: { control: false },
	},
	parameters: { session: "visitor" },
} satisfies Meta<typeof SearchResultsList>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's first page of twelve results, one row of each kind twice over, with the numbered pages under them
export const Default: Story = {}

// the sixth page of a long search, where the page row leaves out the pages between
export const LaterPage: Story = {
	args: { searchPage: { ...SEARCH_PAGE_FIXTURE, rowCount: 120, page: 6, pageCount: 12 } },
}

// the second and last page on its way: two skeleton rows, one per result it holds, under the page row that opened it
export const LoadingPage: Story = { args: { loadingPageNumber: 2 } }

// a signed-in user's page, with the finding they bookmarked: its rank stays, and the mark sits after its age
export const BookmarkedFinding: Story = {
	parameters: { session: "user" },
	args: {
		searchPage: {
			...SEARCH_PAGE_FIXTURE,
			rows: SEARCH_PAGE_FIXTURE.rows.map((searchRow) =>
				searchRow.kind === "finding"
					? { ...searchRow, finding: { ...searchRow.finding, isBookmarked: true } }
					: searchRow,
			),
		},
	},
}

// five results, one of each kind, which fit one page and show no page row
export const OnePage: Story = {
	args: {
		searchPage: { ...SEARCH_PAGE_FIXTURE, rows: SEARCH_ROW_FIXTURES, rowCount: 5, page: 1, pageCount: 1, pageSize: 10 },
	},
}

// the list at 375 pixels
export const Phone: Story = { globals: PHONE_VIEWPORT_GLOBALS }
