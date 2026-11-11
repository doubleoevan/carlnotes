import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { ComponentType, ReactNode } from "react"
import {
	PODCAST_EPISODE_RECORDING_LINE,
	type PodcastEpisodeProgressLine,
	TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_LINE,
} from "../lib/podcastEpisodeCopy"

export type UnpublishedPodcastEpisodeCardProps = {
	podcastEpisode: Pick<PodcastEpisode, "status" | "title" | "smallCoverUrl"> | null
	scanControl?: ReactNode
	// whether the card shows a published podcast episode whose film is rendering
	isVideoRendering?: boolean
}
export type UnpublishedPodcastEpisodeCardElements = {
	Frame: ComponentType<{ children: ReactNode }>
	Group: ComponentType<{ children: ReactNode; className?: string }>
	Text: ComponentType<{ children: ReactNode; className?: string }>
	// the shimmering line after its emoji, which a screen reader skips
	ProgressLine: ComponentType<PodcastEpisodeProgressLine>
	Cover: ComponentType<{ podcastEpisode: Pick<PodcastEpisode, "title" | "smallCoverUrl">; isRecording: boolean }>
}

/**
 * Composes the recording, failed, and film rendering cards in one frame, with the same copy and permitted scan control.
 */
export function UnpublishedPodcastEpisodeCard({
	podcastEpisode,
	scanControl,
	isVideoRendering = false,
	elements: { Frame, Group, Text, ProgressLine, Cover },
}: UnpublishedPodcastEpisodeCardProps & { elements: UnpublishedPodcastEpisodeCardElements }) {
	// the line of the work in progress: the film's render, or the recording, and none for a failed podcast episode
	const isRecording = !isVideoRendering && (!podcastEpisode || podcastEpisode.status === "recording")
	const recordingLine = isRecording ? PODCAST_EPISODE_RECORDING_LINE : null
	const progressLine = isVideoRendering ? TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_LINE : recordingLine
	return (
		<Frame>
			<Cover podcastEpisode={podcastEpisode ?? { title: null, smallCoverUrl: null }} isRecording={isRecording} />
			<Group className="flex min-w-0 flex-1 flex-col gap-1">
				<Text className="text-lg leading-snug font-bold">{podcastEpisode?.title ?? PODCAST_NAME}</Text>
				{progressLine ? (
					<ProgressLine {...progressLine} />
				) : (
					<Text className="text-muted-foreground text-sm">{`${PODCAST_NAME} failed to record.`}</Text>
				)}
				{!progressLine && scanControl && (
					<Group className="text-muted-foreground mt-1 flex flex-row items-center gap-2 text-sm">{scanControl}</Group>
				)}
			</Group>
		</Frame>
	)
}
