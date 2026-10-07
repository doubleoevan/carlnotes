import type { PodcastEpisode } from "@shared/contracts"
import { AI_VOICES_NOTE, PODCAST_NAME } from "@shared/podcastEpisodes"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toPodcastEpisodeDayAndDurationLabels } from "@/lib/labels"
import { cn } from "@/lib/utils"

// the podcast episode, the path of its own page if the title links there, the index of the player's chapter,
// and whether the details sit in a tooltip, which has its own small text and colors
type PodcastEpisodeDetailsProps = {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath?: string
	playerChapterIndex?: number | null
	isInTooltip?: boolean
}

/**
 * A podcast episode's season and episode number, its title, and a line with its date, its duration, its chapter count,
 * and the AI voices note. The player's chapter shows in place of that line if a chapter index is passed.
 */
export function PodcastEpisodeDetails({
	podcastEpisode,
	podcastEpisodePath,
	playerChapterIndex = null,
	isInTooltip = false,
}: PodcastEpisodeDetailsProps) {
	// the player's chapter, and the color of the lines around the title, which fades the tooltip's own text
	const playerChapter = playerChapterIndex === null ? undefined : podcastEpisode.chapters[playerChapterIndex]
	const secondaryTextClass = isInTooltip ? "opacity-80" : "text-muted-foreground"
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			{/* the season and episode number */}
			<div className={cn(secondaryTextClass, "font-display tracking-wide", isInTooltip ? "text-xs" : "text-sm")}>
				{`Season ${podcastEpisode.season} · Episode ${podcastEpisode.episodeNumber}`}
			</div>
			{/* the title, linked to the podcast episode's own page if there is a path */}
			<div className={cn("leading-snug font-bold", isInTooltip ? "text-xs" : "text-lg")}>
				{podcastEpisodePath ? (
					<AnchorLink href={podcastEpisodePath} className="hover:underline">
						{podcastEpisode.title}
					</AnchorLink>
				) : (
					podcastEpisode.title
				)}
			</div>
			{/* the player's chapter, or the date, duration, chapter count, and AI voices note */}
			<div
				className={cn(secondaryTextClass, "text-xs", !isInTooltip && "sm:text-[0.8125rem]")}
				suppressHydrationWarning
			>
				{playerChapter && playerChapterIndex !== null
					? `Chapter ${playerChapterIndex + 1} of ${podcastEpisode.chapters.length} · ${playerChapter.title}`
					: [
							...toPodcastEpisodeDayAndDurationLabels(podcastEpisode),
							`${podcastEpisode.chapters.length} chapters`,
							AI_VOICES_NOTE,
						].join(" · ")}
			</div>
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
	podcastEpisode: PodcastEpisode
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
