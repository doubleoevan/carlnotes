// the YouTube player that a link preview card and the tutorial video's card and dialog share
import { toYoutubeAutoplayUrl, toYoutubeWatchUrl, YOUTUBE_FRAME_ATTRIBUTES } from "@shared/youtube"
import { Play } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { YoutubePlayIcon } from "@/components/common/BrandIcon"
import { cn, isPlainClick } from "@/lib/utils"

/**
 * A YouTube video's thumbnail with a play button over it, linked to the video's YouTube page.
 * A plain click plays the video in place, and nothing reaches YouTube until then.
 */
export function YoutubePlayer({
	youtubeVideoId,
	title,
	thumbnailPath,
	className,
	isUserContent,
	hasYoutubePlayButton,
}: {
	youtubeVideoId: string
	title: string | null
	// the thumbnail served from this origin, or null for the play button alone
	thumbnailPath: string | null
	className?: string
	// a user content video, such as a finding's source, gets rel ugc on its link
	isUserContent?: boolean
	// YouTube's red play button over the thumbnail at full color, in place of the app's button over a dimmed thumbnail
	hasYoutubePlayButton?: boolean
}) {
	const [isPlayingVideo, setIsPlayingVideo] = useState(false)

	// the player replaces the thumbnail once the video plays
	if (isPlayingVideo) {
		return (
			<iframe
				src={toYoutubeAutoplayUrl(youtubeVideoId)}
				title={title ?? "YouTube video"}
				{...YOUTUBE_FRAME_ATTRIBUTES}
				className={cn("aspect-video w-full border-0", className)}
			/>
		)
	}

	// a plain click plays the video in place. any other click, or a page without JavaScript, opens YouTube
	const handlePlayClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
		if (!isPlainClick(event)) {
			return
		}
		event.preventDefault()
		setIsPlayingVideo(true)
	}
	return (
		<AnchorLink
			href={toYoutubeWatchUrl(youtubeVideoId)}
			isUserContent={isUserContent}
			aria-label={`Play ${title ?? "the video"}`}
			onClick={handlePlayClick}
			className={cn("group relative block aspect-video w-full", className)}
		>
			{/* the stored thumbnail */}
			{thumbnailPath && (
				<img src={thumbnailPath} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
			)}
			{/* YouTube's play button over the full-color thumbnail, or the app's button over a dimmed one */}
			{hasYoutubePlayButton ? (
				<span className="absolute inset-0 grid place-items-center">
					<YoutubePlayIcon className="size-16 drop-shadow-lg transition-transform group-hover:scale-110" />
				</span>
			) : (
				<span className="absolute inset-0 grid place-items-center bg-black/30 transition-colors group-hover:bg-black/20">
					<span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-full">
						<Play className="ml-0.5 size-5 fill-current" />
					</span>
				</span>
			)}
		</AnchorLink>
	)
}
