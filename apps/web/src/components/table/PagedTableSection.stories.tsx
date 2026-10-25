// a titled, collapsible table section whose rows sort by column and page five at a time, shown with the podcast
// episodes table the podcast episode page renders through it
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { cn } from "@carlnotes/nightshift/classNames"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TABLE_WIDE_FIRST_COLUMN_CLASS } from "@/lib/styleClasses"
import { PODCAST_EPISODE_FIXTURES } from "../../../.storybook/fixtures/podcastEpisodes"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { PagedTableSection } from "./PagedTableSection"
import { PodcastEpisodeTitleLink } from "./PodcastEpisodeTitleLink"
import { SortableHeader } from "./SortableHeader"

const meta = {
	title: "Table/PagedTableSection",
	component: PagedTableSection,
	args: {
		value: "topic-episodes",
		title: "Other episodes",
		rows: PODCAST_EPISODE_FIXTURES,
		rowSortValues: {
			episode: (podcastEpisode) => podcastEpisode.title,
			description: (podcastEpisode) => podcastEpisode.description,
		},
		tableClassName: "min-w-2xl",
		renderHeadings: (sort) => (
			<>
				<SortableHeader
					sort={sort}
					sortKey="episode"
					label="Episode"
					className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2 font-normal")}
				/>
				<SortableHeader sort={sort} sortKey="description" label="Description" className="py-2 font-normal" />
			</>
		),
		renderRowCells: (podcastEpisode) => (
			<>
				<td className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2")}>
					<PodcastEpisodeTitleLink podcastEpisode={podcastEpisode} />
				</td>
				<td className="text-muted-foreground py-2">{podcastEpisode.description}</td>
			</>
		),
		toRowKey: (podcastEpisode) => podcastEpisode.id,
	},
	argTypes: {
		value: { control: "text" },
		title: { control: "text" },
		tableClassName: { control: "text" },
		rowSortValues: { control: false },
		renderHeadings: { control: false },
		renderRowCells: { control: false },
		toRowKey: { control: false },
	},
} satisfies Meta<typeof PagedTableSection<PodcastEpisodeSummary>>

export default meta
type Story = StoryObj<typeof meta>

// twelve podcast episodes, five a page, with the rows select and the pager under the table
export const Default: Story = {}

// three podcast episodes, which fit one page and show no pagination
export const OnePage: Story = { args: { rows: PODCAST_EPISODE_FIXTURES.slice(0, 3) } }

// the html a browser without JavaScript gets: every row up to the no-script limit and no pagination
export const WithoutJavaScript: Story = {
	// the docs page's inline stories share one html element, so the docs page gives this story its own frame to keep
	// the scripted class on the rest
	parameters: { hasJavaScript: false, docs: toOwnFrameDocs(602) },
}

// no rows, which renders nothing
export const Empty: Story = { args: { rows: [] } }
