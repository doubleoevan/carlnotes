// the tooltip of one chapter on the film's seek bar: the chapter's title over the image that the film shows for it
import type { PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	rememberFailedTopicPodcastEpisodeVideoChapterImage,
	type TopicPodcastEpisodeVideoChapterImage,
	toTopicPodcastEpisodeVideoChapterImages,
} from "./topicPodcastEpisodeVideoChapterImages"

// the band of the square podcast card that the film shows, which starts 560 of its 3000 pixels down: both hosts, their
// mugs, and the microphone
const PODCAST_CARD_BAND_CLASS = "object-[50%_42.67%]"

// where a chapter's segment sits inside the seek bar's frame, in pixels
export type ChapterSegmentBox = { left: number; top: number; width: number; height: number }

// the film's podcast episode, the chapter, and the box of the chapter's segment, which the tooltip points at
type TopicPodcastEpisodeVideoChapterTooltipProps = {
	podcastEpisodeId: string
	chapter: PodcastEpisodeChapter
	chapterSegmentBox: ChapterSegmentBox
}

/**
 * Shows a chapter's tooltip centered over its segment of the film's seek bar: the chapter's title, and under it the
 * image that the film shows for the chapter.
 */
export function TopicPodcastEpisodeVideoChapterTooltip({
	podcastEpisodeId,
	chapter,
	chapterSegmentBox,
}: TopicPodcastEpisodeVideoChapterTooltipProps) {
	return (
		<Tooltip open>
			{/* the segment's box, which the tooltip follows from one segment to the next */}
			<TooltipTrigger asChild>
				<span aria-hidden="true" className="pointer-events-none absolute" style={chapterSegmentBox} />
			</TooltipTrigger>
			{/* the title over the image. the label is the tooltip's one copy for a screen reader */}
			<TooltipContent
				side="top"
				collisionPadding={8}
				updatePositionStrategy="always"
				aria-label={chapter.title}
				className="grid w-64 gap-1.5 p-2"
			>
				<p className="line-clamp-2 font-semibold">{chapter.title}</p>
				<ChapterImage key={chapter.position} podcastEpisodeId={podcastEpisodeId} chapter={chapter} />
			</TooltipContent>
		</Tooltip>
	)
}

// the image that the film shows for a chapter, in a frame at the film's shape. the frame shows the loading note until
// the image has loaded, and a chapter whose every image fails to load shows no frame
function ChapterImage({ podcastEpisodeId, chapter }: { podcastEpisodeId: string; chapter: PodcastEpisodeChapter }) {
	// the Finding's link preview, read once the tooltip shows. a chapter whose Finding was filtered out has none
	const { linkPreview, isLoading } = useFindingLinkPreview(chapter.findingId ?? "", chapter.findingId !== null)
	const [failedImageUrls, setFailedImageUrls] = useState<string[]>([])
	const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null)

	// the first of the chapter's images that has not failed to load, on this page or in this tooltip
	const chapterImages = toTopicPodcastEpisodeVideoChapterImages({
		podcastEpisodeId,
		chapterPosition: chapter.position,
		linkPreviewImagePath: linkPreview?.imagePath ?? null,
	})
	const loadableImage = chapterImages.find((chapterImage) => !failedImageUrls.includes(chapterImage.url))
	const shownImage = isLoading ? undefined : loadableImage
	if (!isLoading && !shownImage) {
		return null
	}
	const isImageLoaded = shownImage !== undefined && loadedImageUrl === shownImage.url

	// remember the failed image for the page, and show the chapter's next image
	const handleImageError = (failedImage: TopicPodcastEpisodeVideoChapterImage): void => {
		rememberFailedTopicPodcastEpisodeVideoChapterImage(failedImage)
		setFailedImageUrls([...failedImageUrls, failedImage.url])
	}
	return (
		<div className="relative aspect-video overflow-hidden rounded-xs bg-primary-foreground/10">
			{/* the loading note, until the image has loaded */}
			{!isImageLoaded && <CoffeeLoading className="absolute inset-0 min-h-0 text-primary-foreground text-xs" />}
			{/* the image, hidden while it loads */}
			{shownImage && (
				<img
					key={shownImage.url}
					src={shownImage.url}
					alt=""
					decoding="async"
					onLoad={() => setLoadedImageUrl(shownImage.url)}
					onError={() => handleImageError(shownImage)}
					className={cn(
						"size-full object-cover",
						!isImageLoaded && "opacity-0",
						shownImage.kind === "podcastCard" && PODCAST_CARD_BAND_CLASS,
					)}
				/>
			)}
		</div>
	)
}
