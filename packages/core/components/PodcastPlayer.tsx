import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { ComponentType, ReactNode } from "react"
import { toClockLabel, toPodcastEpisodeTitleLabel } from "../lib/labels"
import { toChapterIndexAt } from "../lib/podcastEpisodePlayback"
import { usePlayerPositionSeconds, usePodcastEpisodePlayer } from "../stores/podcastEpisodePlayerStore"

export type PodcastPlayerElements = {
	Frame: ComponentType<{ children: ReactNode }>
	Group: ComponentType<{ children: ReactNode; className?: string }>
	Text: ComponentType<{ children: ReactNode; className?: string }>
	Link: ComponentType<{ children: ReactNode; pagePath: string | null; title: string }>
	Cover: ComponentType<{ podcastEpisode: PodcastEpisode; className?: string }>
	Tooltip: ComponentType<{ podcastEpisode: PodcastEpisode; children: ReactNode }>
	Progress: ComponentType<{ positionSeconds: number; durationSeconds: number; playedPercent: number }>
	Controls: ComponentType<{ podcastEpisode: PodcastEpisode }>
	Play: ComponentType<{ podcastEpisode: PodcastEpisode }>
	Announcement: ComponentType<{ children: ReactNode }>
}

/**
 * Composes the persistent player's linked identity, chapter line, progress, skips, and playback control.
 */
export function PodcastPlayer({
	phaseLabel,
	elements: { Frame, Group, Text, Link, Cover, Tooltip, Progress, Controls, Play, Announcement },
}: {
	phaseLabel?: string | null
	elements: PodcastPlayerElements
}) {
	// subscribe to episode identity and progress separately
	const { podcastEpisode } = usePodcastEpisodePlayer()
	const positionSeconds = usePlayerPositionSeconds()
	if (!podcastEpisode) {
		return null
	}
	// derive the visible chapter and bounded progress from the same state as the full player
	const durationSeconds = podcastEpisode.durationSeconds ?? 0
	const playedPercent = Math.min(100, (positionSeconds / Math.max(1, durationSeconds)) * 100)
	const chapterIndex = toChapterIndexAt(podcastEpisode.chapters, positionSeconds)
	const chapter = podcastEpisode.chapters[chapterIndex]
	return (
		<Frame>
			<Progress positionSeconds={positionSeconds} durationSeconds={durationSeconds} playedPercent={playedPercent} />
			<Group className="mx-auto flex w-full max-w-5xl flex-row items-center gap-2 py-2.5 pr-3 pl-4 sm:gap-3">
				<Link pagePath={podcastEpisode.pagePath} title={toPodcastEpisodeTitleLabel(podcastEpisode)}>
					<Cover podcastEpisode={podcastEpisode} className="size-11" />
					<Group className="min-w-0 flex-1">
						<Tooltip podcastEpisode={podcastEpisode}>
							<Text className="truncate text-sm font-bold group-hover:underline">
								{toPodcastEpisodeTitleLabel(podcastEpisode)}
							</Text>
						</Tooltip>
						<Text className="truncate text-xs text-muted-foreground">
							{phaseLabel ??
								(chapter
									? `Ch ${chapterIndex + 1} of ${podcastEpisode.chapters.length} · ${chapter.title}`
									: toClockLabel(positionSeconds))}
						</Text>
						<Announcement>{phaseLabel ?? ""}</Announcement>
					</Group>
				</Link>
				<Controls podcastEpisode={podcastEpisode} />
				<Play podcastEpisode={podcastEpisode} />
			</Group>
		</Frame>
	)
}
