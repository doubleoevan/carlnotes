// the menu option and the hero's button that open the video on making a topic, and the dialog that plays it
import { TOPIC_TUTORIAL_VIDEO, toYoutubeWatchUrl } from "@shared/youtube"
import { AnchorLink } from "@/components/common/AnchorLink"
import { YoutubePlayIcon } from "@/components/common/BrandIcon"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn, toLinkClickHandler } from "@/lib/utils"
import { captureVisitEvent } from "@/lib/visitAnalytics"

// where the video's dialog was opened from
export type TopicTutorialVideoOpener = "hero" | "account-menu" | "mobile-menu"

/**
 * The menu option, named for the video and marked with YouTube's play button, that opens the video's dialog.
 */
export function TopicTutorialVideoOption({ onSelect }: { onSelect: () => void }) {
	return (
		<button type="button" onClick={onSelect} className={MENU_OPTION_CLASS}>
			<YoutubePlayIcon className="size-4" />
			{TOPIC_TUTORIAL_VIDEO.name}
		</button>
	)
}

/**
 * YouTube's play button, linked to the video's YouTube page, that opens the video's dialog on a primary click.
 */
export function TopicTutorialVideoButton({ className, onSelect }: { className?: string; onSelect: () => void }) {
	// a primary click with no modifier key opens the dialog. any other click, or a page without JavaScript, opens YouTube
	const handleClick = toLinkClickHandler(onSelect)
	// what the button does, as its accessible name
	const watchLabel = `Watch ${TOPIC_TUTORIAL_VIDEO.name}`
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink
					href={toYoutubeWatchUrl(TOPIC_TUTORIAL_VIDEO.youtubeVideoId)}
					aria-label={watchLabel}
					onClick={handleClick}
					className={cn("shrink-0 transition-transform hover:scale-110", className)}
				>
					<YoutubePlayIcon className="size-full" />
				</AnchorLink>
			</TooltipTrigger>
			{/* the tooltip names the video in bold */}
			<TooltipContent>
				Watch <span className="font-bold">{TOPIC_TUTORIAL_VIDEO.name}</span>
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * The dialog that shows the video on making a topic, its thumbnail first and the video once play is pressed.
 * Closing it stops the video, and a play reports the video and where its dialog was opened from.
 */
export function TopicTutorialVideoDialog({
	opener,
	onClose,
}: {
	opener: TopicTutorialVideoOpener
	onClose: () => void
}) {
	// a play reports which video and where its dialog was opened from
	const handlePlay = (): void => {
		captureVisitEvent("visit_video_played", { youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId, opener })
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
				{/* the video's title with its coffee cup, which a screen reader skips as decoration */}
				<DialogTitle className="pr-8">
					{TOPIC_TUTORIAL_VIDEO.name} <span aria-hidden="true">☕</span>
				</DialogTitle>
				{/* the thumbnail with YouTube's play button over it, which plays the video in place */}
				<YoutubePlayer
					youtubeVideoId={TOPIC_TUTORIAL_VIDEO.youtubeVideoId}
					title={TOPIC_TUTORIAL_VIDEO.name}
					thumbnailPath={TOPIC_TUTORIAL_VIDEO.thumbnailPath}
					className="overflow-hidden rounded-md"
					hasYoutubePlayButton
					onPlay={handlePlay}
				/>
			</DialogContent>
		</Dialog>
	)
}
