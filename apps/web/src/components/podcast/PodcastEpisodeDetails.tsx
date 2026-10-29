import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import {
	type PodcastEpisodeDetailsElements,
	type PodcastEpisodeDetailsProps,
	PodcastEpisodeDetails as SharedPodcastEpisodeDetails,
} from "@carlnotes/core/components/PodcastEpisodeDetails"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

const elements: PodcastEpisodeDetailsElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => (
		<div className={className} suppressHydrationWarning>
			{children}
		</div>
	),
	Title: ({ podcastEpisode, path, isInTooltip }) => (
		<div className={cn("leading-snug font-bold", isInTooltip ? "text-xs" : "text-lg")}>
			{path ? (
				<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
					<AnchorLink href={path} className="hover:underline">
						{podcastEpisode.title}
					</AnchorLink>
				</PodcastEpisodeTooltip>
			) : (
				podcastEpisode.title
			)}
			{!isInTooltip && <PodcastThemeSongNote />}
		</div>
	),
}

/**
 * Adapts shared episode details to browser links and the theme-song popup.
 */
export function PodcastEpisodeDetails(props: PodcastEpisodeDetailsProps) {
	return <SharedPodcastEpisodeDetails {...props} elements={elements} />
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
