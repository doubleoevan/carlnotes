// the source notes chart in a scan recap: one bar row per Source with what it read and kept, each opening its
// details, and the trash button a topic editor sees on a current Source
import type { SourceResult } from "@carlnotes/contracts/topics"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, within } from "storybook/test"
import { SOURCE_RESULTS_FIXTURE } from "../../../.storybook/fixtures/topics"
import { EARLIER_ROW_ID, SourceResultsChart } from "./SourceResultsChart"

// the widest the scan recap popover gets
const POPOVER_MAX_WIDTH = 512

// what a user or visitor who is neither the owner nor an admin receives: no costs, no failure reasons, and a url
// Source's host in place of its label
const VISITOR_SOURCE_RESULTS: SourceResult[] = SOURCE_RESULTS_FIXTURE.sources.map((sourceResult) => {
	const visitorSourceResult = {
		...sourceResult,
		costDollars: null,
		label: sourceResult.sourceKind === "url" ? "indiehackers.com" : sourceResult.label,
	}
	return visitorSourceResult.status === "failed" ? { ...visitorSourceResult, reason: null } : visitorSourceResult
})

// Sources whose labels outrun the label column: a url Source's whole url and two long feed names
const LONG_LABEL_SOURCE_RESULTS: SourceResult[] = [
	{
		sourceId: "source-changelog",
		sourceKind: "url",
		label:
			"https://docs.example.com/platform/changelog/2026/release-notes-for-the-agent-runtime-and-the-tool-calling-api?utm_source=newsletter&utm_campaign=october",
		status: "ok",
		foundCount: 24,
		keptCount: 3,
		costDollars: 0,
		durationMs: 2_900,
	},
	{
		sourceId: "source-engineering-blogs",
		sourceKind: "rss",
		label: "The engineering blogs of every company that ships a developer platform",
		status: "ok",
		foundCount: 61,
		keptCount: 2,
		costDollars: 0,
		durationMs: 4_100,
	},
	{
		sourceId: "source-conference-talks",
		sourceKind: "youtube",
		label: "Conference talks about developer tooling, agents, and evaluation",
		status: "ok",
		foundCount: 9,
		keptCount: 0,
		costDollars: 0,
		durationMs: 11_300,
	},
]

const meta = {
	title: "Common/SourceResultsChart",
	component: SourceResultsChart,
	args: {
		sourceResults: SOURCE_RESULTS_FIXTURE.sources,
		scannedAt: "2026-10-22T12:00:00Z",
		earlierKeptCount: 0,
		earlierFoundCount: 0,
		initialOpenRowId: "source-linkedin",
	},
	argTypes: {
		earlierKeptCount: { control: { type: "number", min: 0 } },
		earlierFoundCount: { control: { type: "number", min: 0 } },
		initialOpenRowId: { control: "text" },
		sourceRemoval: { control: false },
	},
	// the chart in the popover's text size, at the popover's widest
	decorators: [
		(Story) => (
			<div className="text-sm" style={{ maxWidth: POPOVER_MAX_WIDTH }}>
				<Story />
			</div>
		),
	],
	parameters: { surface: "card" },
} satisfies Meta<typeof SourceResultsChart>

export default meta
type Story = StoryObj<typeof meta>

// the owner's scan of ten Sources that read 349 and kept 13, with the top row open, a subreddit that fell back, and a
// page that failed
export const Mixed: Story = {}

// the same scan, which also read 12 findings from earlier scans that no Source returned and kept 4, with that row open
export const EarlierFindings: Story = {
	args: { earlierKeptCount: 4, earlierFoundCount: 12, initialOpenRowId: EARLIER_ROW_ID },
}

// the owner's view of the subreddit's row: its cost and time, and the feed it fell back to
export const OwnerOpen: Story = {
	args: { initialOpenRowId: "source-startups" },
}

// a visitor's view of the failed row: no cost anywhere, no failure reason, and the page's host as its label
export const VisitorOpen: Story = {
	args: { sourceResults: VISITOR_SOURCE_RESULTS, initialOpenRowId: "source-indie-hackers" },
}

// labels too long for the label column truncate, and the open row's detail line wraps the full url
export const LongLabels: Story = {
	args: { sourceResults: LONG_LABEL_SOURCE_RESULTS, initialOpenRowId: "source-changelog" },
}

// a topic with only web search, which read and kept
export const SingleSource: Story = {
	args: {
		sourceResults: [
			{
				sourceId: "source-web",
				sourceKind: "search",
				label: "web search",
				status: "ok",
				foundCount: 42,
				keptCount: 6,
				costDollars: 0.012,
				durationMs: 12_400,
			},
		],
		initialOpenRowId: null,
	},
}

// a tap opens a row, a tap on another row closes the first, and a tap on the open row closes it
export const ToggleRow: Story = {
	args: { initialOpenRowId: null },
	play: async ({ canvas, userEvent }) => {
		// open the top row and check its detail line
		const linkedInRow = canvas.getByRole("button", { name: /^LinkedIn posts via Exa search,/ })
		const hackerNewsRow = canvas.getByRole("button", { name: /^Hacker News front page,/ })
		await userEvent.click(linkedInRow)
		await expect(linkedInRow).toHaveAttribute("aria-expanded", "true")
		await expect(canvas.getByText(/read 121 · kept 6/)).toBeVisible()

		// open the second row, which closes the first
		await userEvent.click(hackerNewsRow)
		await expect(hackerNewsRow).toHaveAttribute("aria-expanded", "true")
		await expect(linkedInRow).toHaveAttribute("aria-expanded", "false")
		await expect(canvas.queryByText(/read 121 · kept 6/)).toBeNull()

		// tap the open row again to close it
		await userEvent.click(hackerNewsRow)
		await expect(hackerNewsRow).toHaveAttribute("aria-expanded", "false")
	},
}

// hovering a row opens its tooltip, with the full label in bold over a bulleted list of its details
export const RowTooltip: Story = {
	args: { initialOpenRowId: null },
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: /^LinkedIn posts via Exa search,/ }))
		const rowTooltip = await within(document.body).findByRole("tooltip")
		await expect(rowTooltip).toHaveTextContent("LinkedIn posts via Exa search")
		await expect(rowTooltip).toHaveTextContent("read 121")
		await expect(rowTooltip).toHaveTextContent("kept 6")
		await expect(rowTooltip).toHaveTextContent("cost $0.031")
	},
}

// a topic editor's view on the topic page: the open row of a current Source ends in a trash button, and a tap on it
// asks to remove that Source
export const RemovableSource: Story = {
	args: {
		sourceRemoval: {
			removableSourceIds: new Set(SOURCE_RESULTS_FIXTURE.sources.map((sourceResult) => sourceResult.sourceId)),
			onRemoveSource: fn(),
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Remove source" }))
		await expect(args.sourceRemoval?.onRemoveSource).toHaveBeenCalledWith(
			"source-linkedin",
			"LinkedIn posts via Exa search",
		)
	},
}
