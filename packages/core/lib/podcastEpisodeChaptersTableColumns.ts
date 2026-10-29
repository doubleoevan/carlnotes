import type { PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toClockLabel, toCountLabel } from "./labels"

/**
 * Defines chapter table columns and full-episode totals for both platform tables.
 */
export function toPodcastEpisodeChaptersTableColumns({
	chapters,
	renderTitle,
	renderFinding,
	renderText,
}: {
	chapters: PodcastEpisodeChapter[]
	renderTitle: (chapter: PodcastEpisodeChapter) => ReactNode
	renderFinding: (chapter: PodcastEpisodeChapter) => ReactNode
	renderText: (text: string) => ReactNode
}): TableColumn<PodcastEpisodeChapter>[] {
	// total the complete episode independently of the currently displayed page
	const { durationLabel, sourceCountLabel, chapterCountLabel } = toPodcastEpisodeChapterTotals(chapters)
	return [
		{
			key: "chapter",
			label: "Chapter",
			width: 260,
			isSortable: false,
			render: renderTitle,
			footer: renderText(chapterCountLabel),
		},
		{
			key: "starts",
			label: "Starts",
			width: 85,
			isSortable: false,
			render: (chapter) => renderText(toClockLabel(chapter.startSeconds)),
		},
		{
			key: "length",
			label: "Length",
			width: 85,
			isSortable: false,
			render: (chapter) => renderText(toClockLabel(chapter.endSeconds - chapter.startSeconds)),
			footer: renderText(durationLabel),
		},
		{
			key: "finding",
			label: "Topic Finding",
			width: 320,
			isSortable: false,
			render: renderFinding,
			footer: renderText(sourceCountLabel),
		},
	]
}

/**
 * Formats the complete episode totals independently of pagination on either platform.
 */
export function toPodcastEpisodeChapterTotals(chapters: PodcastEpisodeChapter[]): {
	chapterCountLabel: string
	durationLabel: string
	sourceCountLabel: string
} {
	// sum chapter lengths and count distinct hosts before formatting the table footer
	const durationSeconds = chapters.reduce((sum, chapter) => sum + chapter.endSeconds - chapter.startSeconds, 0)
	const sourceCount = new Set(chapters.map((chapter) => toHostWithoutWww(chapter.sourceUrl))).size
	return {
		chapterCountLabel: toCountLabel(chapters.length, "chapter"),
		durationLabel: toClockLabel(durationSeconds),
		sourceCountLabel: toCountLabel(sourceCount, "source"),
	}
}
