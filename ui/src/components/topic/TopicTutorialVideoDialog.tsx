// the menu option that opens the video on making a topic, and the dialog that plays it

import { TOPIC_TUTORIAL_VIDEO } from "@shared/youtube"
import { YoutubePlayIcon } from "@/components/common/BrandIcon"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicTutorialVideoPlayer, TopicTutorialVideoTitle } from "@/components/topic/TopicTutorialVideoCard"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"

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
 * The dialog that shows the video on making a topic, its thumbnail first and the video once play is pressed.
 * Closing it stops the video.
 */
export function TopicTutorialVideoDialog({ onClose }: { onClose: () => void }) {
	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
				<DialogTitle className="pr-8">
					<TopicTutorialVideoTitle />
				</DialogTitle>
				<TopicTutorialVideoPlayer />
			</DialogContent>
		</Dialog>
	)
}
