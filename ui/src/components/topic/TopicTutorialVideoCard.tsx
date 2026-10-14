// the homepage's card that shows a visitor the video on making a topic, and the player and title that the card and the
// video's dialog share
import { TOPIC_TUTORIAL_VIDEO } from "@shared/youtube"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The centered card above the Featured topics section that plays the video on making a topic.
 */
export function TopicTutorialVideoCard() {
	return (
		<section aria-labelledby="topic-tutorial-video-title" className={cn(CARD_CLASS, "mx-auto mb-4 max-w-2xl")}>
			{/* the card's title in the display font */}
			<h2 id="topic-tutorial-video-title" className="font-display mb-3 text-center text-2xl">
				<TopicTutorialVideoTitle />
			</h2>
			<TopicTutorialVideoPlayer />
		</section>
	)
}

/**
 * The video's thumbnail with YouTube's play button over it, which plays the video in place.
 */
export function TopicTutorialVideoPlayer() {
	return (
		<YoutubePlayer
			youtubeVideoId={TOPIC_TUTORIAL_VIDEO.youtubeVideoId}
			title={TOPIC_TUTORIAL_VIDEO.name}
			thumbnailPath={TOPIC_TUTORIAL_VIDEO.thumbnailPath}
			className="overflow-hidden rounded-md"
			hasYoutubePlayButton
		/>
	)
}

/**
 * The video's title with its coffee cup, which a screen reader skips as decoration.
 */
export function TopicTutorialVideoTitle() {
	return (
		<>
			{TOPIC_TUTORIAL_VIDEO.name} <span aria-hidden="true">☕</span>
		</>
	)
}
