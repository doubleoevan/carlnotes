import { authClient } from "@carlnotes/client/authClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toBrowserPlatform } from "@carlnotes/contracts/userAgent"
import {
	type PodcastFeedDialogElements,
	PodcastFeedDialog as SharedPodcastFeedDialog,
} from "@carlnotes/core/components/PodcastFeedDialog"
import { usePodcastFeed } from "@carlnotes/core/hooks/usePodcastFeed"
import { toPodcastAppLink } from "@carlnotes/core/lib/podcastFeed"
import { Copy, Podcast } from "lucide-react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { useBrowserValue } from "@/hooks/useBrowserValue"
import { copyToClipboard } from "@/lib/utils"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"

export const podcastFeedDialogElements: PodcastFeedDialogElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Description: DialogDescription,
	Strong: ({ children }) => <strong className="font-bold">{children}</strong>,
	Code: ({ children, className }) => <p className={className}>{children}</p>,
	Button: ({ children, icon, onPress, ...props }) => (
		<Button {...props} onClick={onPress}>
			{icon === "copy" ? <Copy className="size-4.5" /> : icon === "podcast" ? <Podcast className="size-4.5" /> : null}
			{children}
		</Button>
	),
	Confirm: ConfirmDialog,
}

/**
 * Adapts shared feed state and composition to the browser dialog, clipboard, and podcast app links.
 */
export function PodcastFeedDialog({
	topic,
	onClose,
}: {
	topic: Pick<TopicResponse, "id" | "name" | "visibility">
	onClose: () => void
}) {
	// load this account’s feed and the browser’s supported podcast app
	const { data: session } = authClient().useSession()
	const feed = usePodcastFeed({ topicId: topic.id, userId: session?.user.id ?? null })
	const platform = useBrowserValue(readBrowserPlatform, "other")
	const appLink = feed.url ? toPodcastAppLink({ platform, feedUrl: feed.url }) : null

	// record the chosen subscription action
	const captureSubscribeClick = (channel: "app" | "copy-link"): void =>
		captureVisitEvent("visit_podcast_subscribe_clicked", { channel, ...toPublicTopicProperties(topic) })

	// open the feed in the supported podcast app
	const handleOpenApp = (): void => {
		if (!appLink) {
			return
		}
		captureSubscribeClick("app")
		window.location.assign(appLink.url)
	}

	// copy the available feed link
	const handleCopy = (): void => {
		if (!feed.url) {
			return
		}
		captureSubscribeClick("copy-link")
		void copyToClipboard(feed.url, "Feed link copied.")
	}
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Subscribe to Coffee Break</DialogTitle>
				<SharedPodcastFeedDialog
					topicName={topic.name}
					feed={feed}
					isOwnFeed={topic.visibility !== "public"}
					appLabel={appLink?.label}
					onOpenApp={handleOpenApp}
					onCopy={handleCopy}
					elements={podcastFeedDialogElements}
				/>
			</DialogContent>
		</Dialog>
	)
}

function readBrowserPlatform(): ReturnType<typeof toBrowserPlatform> {
	// recognize iPad desktop user agents
	const isIpad = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1
	return isIpad ? "ios" : toBrowserPlatform(navigator.userAgent)
}
