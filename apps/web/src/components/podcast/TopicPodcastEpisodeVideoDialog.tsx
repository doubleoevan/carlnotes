import {
	TopicPodcastEpisodeVideoDialog as SharedTopicPodcastEpisodeVideoDialog,
	type TopicPodcastEpisodeVideoDialogElements,
} from "@carlnotes/core/components/TopicPodcastEpisodeVideoDialog"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"

const elements: TopicPodcastEpisodeVideoDialogElements = {
	Frame: ({ title, onClose, children }) => (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-3xl [&>*]:min-w-0">
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
		</Dialog>
	),
	Player: TopicPodcastEpisodeVideoPlayer,
	Loading: () => <CoffeeLoading className="aspect-video text-base" />,
	Failure: ({ children }) => (
		<p role="alert" className="text-sm text-destructive">
			{children}
		</p>
	),
}

/**
 * Adapts the Video dialog to the browser's dialog.
 */
export function TopicPodcastEpisodeVideoDialog(props: {
	podcastEpisodeId: string
	title: string
	shouldPlayOnLoad?: boolean
	onClose: () => void
}) {
	return <SharedTopicPodcastEpisodeVideoDialog {...props} elements={elements} />
}
