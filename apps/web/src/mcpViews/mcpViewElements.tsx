// the MCP view elements more than one MCP view uses: the tables' layout for a narrow frame, the topics table's cells, a
// Topic Post's info popup, the comment thread, the film player, and the link to the site
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { DataTableElements } from "@carlnotes/core/components/DataTable"
import type { TopicPodcastEpisodeVideoPlayerElements } from "@carlnotes/core/components/TopicPodcastEpisodeVideoPlayer"
import type { TopicPostInfoElements } from "@carlnotes/core/components/TopicPostInfo"
import type { TopicsTableElements } from "@carlnotes/core/components/TopicsTable"
import type { RowSort } from "@carlnotes/core/hooks/useRowSort"
import type { SocialElements } from "@carlnotes/core/lib/socialElements"
import { toKeptOverSeenLabel } from "@carlnotes/core/lib/topicsTableColumns"
import { togglePlayback } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { TOPIC_PODCAST_EPISODE_VIDEO_PLAYER_ELEMENTS } from "@/components/podcast/TopicPodcastEpisodeVideoPlayer"
import { Switch } from "@/components/primitives/switch"
import { SOCIAL_ELEMENTS } from "@/components/social/socialElements"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TOPICS_TABLE_ELEMENTS } from "@/components/table/TopicsTable"
import { STANDALONE_LINE_LINK_CLASS } from "@/lib/styleClasses"
import { TABLE_HEAD_CLASS } from "@/lib/tableClasses"
import { playPodcastEpisode, toLoadedPodcastEpisode } from "@/stores/podcastEpisodePlayerStore"
import { McpViewReactionRow } from "./McpViewReactionRow"
import { findMcpViewPodcastEpisode } from "./mcpViewHost"

// the columns a narrow container leaves to a row's expanded details
const WIDE_COLUMN_KEYS = ["source", "published"]

// the key of the column that holds a row's controls, whose heading only a screen reader reads
const CONTROLS_COLUMN_KEY = "controls"

/**
 * The controls column's heading, and a width that fits a row's expand button.
 */
export const MCP_VIEW_CONTROLS_COLUMN = { key: CONTROLS_COLUMN_KEY, label: "Actions", width: 52 }

/**
 * The sort of an MCP view's table, whose rows keep the order the tool returned them in.
 */
export const UNSORTED_MCP_VIEW_TABLE_SORT: RowSort = { sortKey: null, isDescending: false, toggleSort: () => {} }

/**
 * The table elements of an MCP view. A wide container shows a table with a fixed layout, so long text wraps, and a narrow
 * one keeps each row's title beside its controls and leaves the wide columns out.
 */
export const MCP_VIEW_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children, columns }) => (
		<table className="w-full table-fixed text-left text-sm @max-md:block">
			<colgroup>
				{columns.map((column) => (
					<col key={column.key} style={column.width ? { width: column.width } : undefined} />
				))}
			</colgroup>
			{children}
		</table>
	),
	Head: ({ children }) => <thead className={cn(TABLE_HEAD_CLASS, "@max-md:hidden")}>{children}</thead>,
	Body: ({ children }) => <tbody className="@max-md:block">{children}</tbody>,
	Row: ({ children, hasSeparator, className }) => (
		<tr className={cn("@max-md:flex", hasSeparator && "border-b", className)}>{children}</tr>
	),
	Cell: ({ children, column }) => (
		<td
			className={cn(
				"py-2 pr-2 align-top @max-md:block",
				column === CONTROLS_COLUMN_KEY ? "@max-md:shrink-0 @max-md:pr-0" : "@max-md:min-w-0 @max-md:flex-1",
				WIDE_COLUMN_KEYS.includes(column) && "@max-md:hidden",
			)}
		>
			{children}
		</td>
	),
	Details: ({ children, columnCount, hasSeparator }) => (
		<tr className={cn("@max-md:block", hasSeparator && "border-b")}>
			<td colSpan={columnCount} className="py-2 @max-md:block">
				{children}
			</td>
		</tr>
	),
	Header: ({ column }) => (
		<th className={cn("py-2 pr-2 font-normal", column.key === CONTROLS_COLUMN_KEY && "sr-only")}>{column.label}</th>
	),
}

/**
 * The discussion's play button in an MCP view. A tool result holds the recording with the caller's play token on its
 * audio url, so a press plays that one in place of a read of the post.
 */
export function McpViewDiscussionPlayButton({ podcastEpisode }: { podcastEpisode: PodcastEpisode }) {
	const handlePress = (): void => {
		if (toLoadedPodcastEpisode()?.id === podcastEpisode.id) {
			togglePlayback()
			return
		}

		// play the recording the tool result gave the MCP view
		const mcpViewPodcastEpisode = findMcpViewPodcastEpisode(podcastEpisode.id)
		if (mcpViewPodcastEpisode) {
			void playPodcastEpisode(mcpViewPodcastEpisode)
		}
	}
	return <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" onPress={handlePress} />
}

/**
 * The elements an MCP view replaces in a Topic Post's info popup. A frame cannot write to the clipboard, so the popup
 * offers no Share.
 */
export const MCP_VIEW_TOPIC_POST_INFO_ELEMENTS: Partial<TopicPostInfoElements> = {
	Reactions: (props) => <McpViewReactionRow {...props} className="flex flex-col gap-1" />,
	ShareButton: () => null,
	PlayButton: McpViewDiscussionPlayButton,
}

/**
 * The web's elements of a comment thread, with no edit, delete, or report control.
 */
export const MCP_VIEW_SOCIAL_ELEMENTS: SocialElements = {
	...SOCIAL_ELEMENTS,
	RowControl: () => null,
	Report: () => null,
}

// the film's frame reports no controls, so the player keeps picture-in-picture and fullscreen hidden
const ignoreSurfaceControls = (): void => {}

/**
 * The film player elements of an MCP view, which plays the film in the host's frame and never asks the browser for
 * picture-in-picture or fullscreen.
 */
export const MCP_VIEW_FILM_PLAYER_ELEMENTS: TopicPodcastEpisodeVideoPlayerElements = {
	...TOPIC_PODCAST_EPISODE_VIDEO_PLAYER_ELEMENTS,
	Surface: (props) => (
		<TOPIC_PODCAST_EPISODE_VIDEO_PLAYER_ELEMENTS.Surface {...props} onSurfaceControls={ignoreSurfaceControls} />
	),
}

/**
 * The web's topic cells in an MCP view, with the kept count as text and the email switches disabled where a table shows
 * them.
 */
export const MCP_VIEW_TOPICS_TABLE_ELEMENTS: TopicsTableElements = {
	...TOPICS_TABLE_ELEMENTS,
	TopicInfo: ({ topic }) => <span className="text-muted-foreground">{toKeptOverSeenLabel(topic)}</span>,
	Switch: ({ label, isChecked }) => <Switch aria-label={label} checked={isChecked} disabled />,
}

/**
 * The link under an MCP view's list that opens its page on the site, spaced the same in every view.
 */
export function McpViewSiteLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<AnchorLink href={href} className={cn(STANDALONE_LINE_LINK_CLASS, "mt-4")}>
			{children}
		</AnchorLink>
	)
}
