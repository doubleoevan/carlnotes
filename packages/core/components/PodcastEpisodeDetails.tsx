import type { PodcastEpisode, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { AI_VOICES_NOTE } from "@carlnotes/contracts/podcastEpisodes"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentType, ReactNode } from "react"
import { toCountLabel, toPodcastEpisodeDayAndDurationLabels } from "../lib/labels"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PodcastEpisodeDetailsProps = {
	podcastEpisode: PodcastEpisodeSummary & { chapters?: PodcastEpisode["chapters"] }
	podcastEpisodePath?: string
	playerChapterIndex?: number | null
	isInTooltip?: boolean
}
export type PodcastEpisodeDetailsElements = {
	Group: Container
	Text: Container
	Title: ComponentType<{
		podcastEpisode: PodcastEpisodeDetailsProps["podcastEpisode"]
		path?: string
		isInTooltip: boolean
	}>
}

/**
 * Composes the episode identity, current chapter, metadata, and tooltip description.
 */
export function PodcastEpisodeDetails({
	podcastEpisode,
	podcastEpisodePath,
	playerChapterIndex = null,
	isInTooltip = false,
	elements: { Group, Text, Title },
}: PodcastEpisodeDetailsProps & { elements: PodcastEpisodeDetailsElements }) {
	// select the current chapter and the surrounding metadata
	const chapter = playerChapterIndex === null ? undefined : podcastEpisode.chapters?.[playerChapterIndex]
	const secondaryTextClassName = isInTooltip ? "opacity-80" : "text-muted-foreground"
	const labels = [
		...toPodcastEpisodeDayAndDurationLabels(podcastEpisode),
		toCountLabel(podcastEpisode.chapterCount, "chapter"),
		...(isInTooltip ? [] : [AI_VOICES_NOTE]),
	]
	return (
		<Group className="flex min-w-0 flex-1 flex-col gap-0.5">
			<Text
				className={cn(secondaryTextClassName, "font-display tracking-wide", isInTooltip ? "text-xs" : "text-sm")}
			>{`Season ${podcastEpisode.season} · Episode ${podcastEpisode.episodeNumber}`}</Text>
			<Title podcastEpisode={podcastEpisode} path={podcastEpisodePath} isInTooltip={isInTooltip} />
			<Text className={cn(secondaryTextClassName, "text-xs", !isInTooltip && "sm:text-[0.8125rem]")}>
				{chapter && playerChapterIndex !== null
					? `Chapter ${playerChapterIndex + 1} of ${podcastEpisode.chapterCount} · ${chapter.title}`
					: toDotSeparatedText(labels)}
			</Text>
			{isInTooltip && podcastEpisode.description && <Text className="mt-1">{podcastEpisode.description}</Text>}
		</Group>
	)
}
