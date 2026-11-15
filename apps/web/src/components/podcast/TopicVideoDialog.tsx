import {
	TopicVideoDialog as SharedTopicVideoDialog,
	type TopicVideoDialogElements,
} from "@carlnotes/core/components/TopicVideoDialog"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicVideoPlayer } from "./TopicVideoPlayer"

const elements: TopicVideoDialogElements = {
	Frame: ({ title, onClose, children }) => (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-3xl [&>*]:min-w-0">
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
		</Dialog>
	),
	Player: TopicVideoPlayer,
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
export function TopicVideoDialog(props: {
	podcastEpisodeId: string
	title: string
	shouldPlayOnLoad?: boolean
	onClose: () => void
}) {
	return <SharedTopicVideoDialog {...props} elements={elements} />
}
