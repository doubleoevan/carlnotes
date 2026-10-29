import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { ComponentType, ReactNode } from "react"

export type UnpublishedPodcastEpisodeCardProps = {
	podcastEpisode: Pick<PodcastEpisode, "status" | "title" | "smallCoverUrl"> | null
	scanControl?: ReactNode
}
export type UnpublishedPodcastEpisodeCardElements = {
	Frame: ComponentType<{ children: ReactNode }>
	Group: ComponentType<{ children: ReactNode; className?: string }>
	Text: ComponentType<{ children: ReactNode; className?: string }>
	Recording: ComponentType
	Cover: ComponentType<{ podcastEpisode: Pick<PodcastEpisode, "title" | "smallCoverUrl">; isRecording: boolean }>
}

/**
 * Composes the recording and failed episode cards with the same copy and permitted scan control.
 */
export function UnpublishedPodcastEpisodeCard({
	podcastEpisode,
	scanControl,
	elements: { Frame, Group, Text, Recording, Cover },
}: UnpublishedPodcastEpisodeCardProps & { elements: UnpublishedPodcastEpisodeCardElements }) {
	const isRecording = !podcastEpisode || podcastEpisode.status === "recording"
	return (
		<Frame>
			<Cover podcastEpisode={podcastEpisode ?? { title: null, smallCoverUrl: null }} isRecording={isRecording} />
			<Group className="flex min-w-0 flex-1 flex-col gap-1">
				<Text className="text-lg leading-snug font-bold">{podcastEpisode?.title ?? PODCAST_NAME}</Text>
				{isRecording ? (
					<Recording />
				) : (
					<Text className="text-muted-foreground text-sm">{`${PODCAST_NAME} failed to record.`}</Text>
				)}
				{!isRecording && scanControl && (
					<Group className="text-muted-foreground mt-1 flex flex-row items-center gap-2 text-sm">{scanControl}</Group>
				)}
			</Group>
		</Frame>
	)
}
