import type { PodcastEpisode, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { AI_VOICES_NOTE, PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import { toCountLabel, toPodcastEpisodeDayAndDurationLabels } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ThemeSongNote } from "./ThemeSongNote"

// the podcast episode, the path of its own page if the title links there, the index of the player's chapter,
// and whether the details sit in a tooltip, which has its own small text and colors
type PodcastEpisodeDetailsProps = {
	podcastEpisode: PodcastEpisodeSummary & { chapters?: PodcastEpisode["chapters"] }
	podcastEpisodePath?: string
	playerChapterIndex?: number | null
	isInTooltip?: boolean
}

/**
 * A podcast episode's season and episode number, its title, and a line with its date, its duration, its chapter count,
 * and the AI voices note outside a tooltip. The player's chapter shows in place of that line if a chapter index is
 * passed. A tooltip adds the description, and a linked title outside a tooltip opens the episode's tooltip.
 */
export function PodcastEpisodeDetails({
	podcastEpisode,
	podcastEpisodePath,
	playerChapterIndex = null,
	isInTooltip = false,
}: PodcastEpisodeDetailsProps) {
	// the player's chapter of an episode with its chapters, how many chapters the episode has, and the color of the
	// lines around the title, which fades the tooltip's own text
	const playerChapter = playerChapterIndex === null ? undefined : podcastEpisode.chapters?.[playerChapterIndex]
	const chapterCount = podcastEpisode.chapterCount
	const secondaryTextClass = isInTooltip ? "opacity-80" : "text-muted-foreground"

	// the date, duration, and chapter count, and the AI voices note outside a tooltip
	const podcastEpisodeDetailLabels = [
		...toPodcastEpisodeDayAndDurationLabels(podcastEpisode),
		toCountLabel(chapterCount, "chapter"),
		...(isInTooltip ? [] : [AI_VOICES_NOTE]),
	]
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			{/* the season and episode number */}
			<div className={cn(secondaryTextClass, "font-display tracking-wide", isInTooltip ? "text-xs" : "text-sm")}>
				{`Season ${podcastEpisode.season} · Episode ${podcastEpisode.episodeNumber}`}
			</div>
			{/* the title, linked to its page with its tooltip if there is a path, and the theme song's note outside a
			    tooltip */}
			<div className={cn("leading-snug font-bold", isInTooltip ? "text-xs" : "text-lg")}>
				{podcastEpisodePath ? (
					<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
						<AnchorLink href={podcastEpisodePath} className="hover:underline">
							{podcastEpisode.title}
						</AnchorLink>
					</PodcastEpisodeTooltip>
				) : (
					podcastEpisode.title
				)}
				{!isInTooltip && <ThemeSongNote />}
			</div>
			{/* the player's chapter, or the date, duration, chapter count, and AI voices note */}
			<div
				className={cn(secondaryTextClass, "text-xs", !isInTooltip && "sm:text-[0.8125rem]")}
				suppressHydrationWarning
			>
				{playerChapter && playerChapterIndex !== null
					? `Chapter ${playerChapterIndex + 1} of ${chapterCount} · ${playerChapter.title}`
					: toDotSeparatedText(podcastEpisodeDetailLabels)}
			</div>
			{/* the description, only in a tooltip */}
			{isInTooltip && podcastEpisode.description && <p className="mt-1">{podcastEpisode.description}</p>}
		</div>
	)
}

/**
 * A tooltip on its child that names the podcast above the podcast episode's details.
 */
export function PodcastEpisodeTooltip({
	podcastEpisode,
	children,
}: {
	podcastEpisode: PodcastEpisodeSummary
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			{/* the lines fill the tooltip's width before the lines wrap, instead of the tooltip's balanced lines */}
			<TooltipContent side="top" className="max-w-sm text-left text-wrap">
				<p className="mb-0.5 font-semibold">{PODCAST_NAME}</p>
				<PodcastEpisodeDetails podcastEpisode={podcastEpisode} isInTooltip />
			</TooltipContent>
		</Tooltip>
	)
}
