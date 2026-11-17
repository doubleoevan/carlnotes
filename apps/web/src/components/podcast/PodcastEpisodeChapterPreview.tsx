// the chapter source link and image shown over a podcast or film seek bar
import type { PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { cn } from "@carlnotes/nightshift/classNames"
import { ExternalLink } from "lucide-react"
import { type RefObject, useRef, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { HostFavicon } from "@/components/common/HostFavicon"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/primitives/popover"
import {
	type PodcastEpisodeChapterImage,
	rememberFailedPodcastEpisodeChapterImage,
	toPodcastEpisodeChapterImages,
} from "./podcastEpisodeChapterImages"

// the band of the square podcast card that the film shows, which starts 560 of its 3000 pixels down: both hosts, their
// mugs, and the microphone
const PODCAST_CARD_BAND_CLASS = "object-[50%_42.67%]"

type PodcastEpisodeChapterPreviewProps = {
	podcastEpisodeId: string
	chapter: PodcastEpisodeChapter
	chapterSegmentRef: RefObject<Element | null>
	hasVideo: boolean
	shouldFocusSource?: boolean
	onPointerEnter?: () => void
	onPointerLeave?: () => void
	onDismiss?: () => void
	onEscapeKeyDown?: (event: KeyboardEvent) => void
}

/**
 * Shows a chapter's source link and image above its segment.
 */
export function PodcastEpisodeChapterPreview({
	podcastEpisodeId,
	chapter,
	chapterSegmentRef,
	hasVideo,
	shouldFocusSource,
	onPointerEnter,
	onPointerLeave,
	onDismiss,
	onEscapeKeyDown,
}: PodcastEpisodeChapterPreviewProps) {
	const sourceLinkRef = useRef<HTMLAnchorElement>(null)

	// fetch the Finding's preview once for its image and favicon
	const { linkPreview, isLoading } = useFindingLinkPreview(chapter.findingId ?? "", chapter.findingId !== null)
	const chapterImages = toPodcastEpisodeChapterImages({
		podcastEpisodeId,
		chapterPosition: chapter.position,
		linkPreviewImagePath: linkPreview?.imagePath ?? null,
		hasVideo,
	})

	return (
		<Popover open onOpenChange={(isOpen) => !isOpen && onDismiss?.()}>
			<PopoverAnchor virtualRef={chapterSegmentRef} />
			{/* the source link stays interactive above the image */}
			<PopoverContent
				side="top"
				sideOffset={8}
				aria-label="Chapter source"
				aria-describedby={undefined}
				onPointerEnter={onPointerEnter}
				onPointerLeave={onPointerLeave}
				onOpenAutoFocus={(event) => {
					event.preventDefault()
					if (shouldFocusSource) {
						sourceLinkRef.current?.focus()
					}
				}}
				onEscapeKeyDown={onEscapeKeyDown}
				className="bg-primary text-primary-foreground w-64 overflow-visible border-0 text-xs"
				bodyClassName="grid gap-1.5 p-2"
				arrowClassName="fill-primary"
			>
				<AnchorLink
					ref={sourceLinkRef}
					href={chapter.sourceUrl}
					isNewTab
					isUserContent
					className="flex min-h-6 w-fit max-w-full items-center gap-1.5 rounded-sm font-semibold hover:underline focus-visible:outline-2"
				>
					<HostFavicon faviconPath={linkPreview?.faviconPath ?? chapter.faviconPath} />
					<span className="line-clamp-2 min-w-0">{chapter.title}</span>
					<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
					<span className="sr-only"> (opens in a new tab)</span>
				</AnchorLink>
				<ChapterImage key={chapter.position} chapterImages={chapterImages} isLoading={isLoading} />
			</PopoverContent>
		</Popover>
	)
}

// the first available chapter image, with a loading note while it loads
function ChapterImage({
	chapterImages,
	isLoading,
}: {
	chapterImages: PodcastEpisodeChapterImage[]
	isLoading: boolean
}) {
	// track loading and fallbacks for this chapter
	const [failedImageUrls, setFailedImageUrls] = useState<string[]>([])
	const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null)

	// wait for the link preview before showing the first remaining image
	const loadableImage = chapterImages.find((chapterImage) => !failedImageUrls.includes(chapterImage.url))
	const shownImage = isLoading ? undefined : loadableImage
	if (!isLoading && !shownImage) {
		return null
	}
	const isImageLoaded = shownImage !== undefined && loadedImageUrl === shownImage.url

	// remember the failed image for the page, and show the chapter's next image
	const handleImageError = (failedImage: PodcastEpisodeChapterImage): void => {
		rememberFailedPodcastEpisodeChapterImage(failedImage)
		setFailedImageUrls((previousFailedImageUrls) => [...previousFailedImageUrls, failedImage.url])
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
