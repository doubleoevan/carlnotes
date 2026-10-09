import type { TopicResponse } from "@shared/contracts"
import { toBrowserPlatform } from "@shared/userAgent"
import { Copy, Podcast } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { fetchPodcastFeedUrl, sendResetPodcastFeed } from "@/clients/podcastEpisodeClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { useBrowserValue } from "@/hooks/useBrowserValue"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"

// the podcast app link for each platform. iOS opens Apple Podcasts, and Android apps register the pcast scheme
const PODCAST_APP_LINKS = {
	ios: { scheme: "podcast://", label: "Open in Apple Podcasts" },
	android: { scheme: "pcast://", label: "Open in your podcast app" },
}

// the platform of the device that the dialog is open on, read from its user agent. a Mac with touch is an iPad
function readBrowserPlatform(): ReturnType<typeof toBrowserPlatform> {
	const isIpad = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1
	return isIpad ? "ios" : toBrowserPlatform(navigator.userAgent)
}

/**
 * The dialog that adds a topic's podcast feed to a podcast app, by the app's link or by a copied feed url.
 */
export function PodcastFeedDialog({
	topic,
	onClose,
}: {
	topic: Pick<TopicResponse, "id" | "name" | "visibility">
	onClose: () => void
}) {
	// the url of the user's podcast feed for the topic, loaded as the dialog opens
	const [podcastFeedUrl, setPodcastFeedUrl] = useState<string | null>(null)
	const [isPodcastFeedUrlLoading, setIsPodcastFeedUrlLoading] = useState(true)
	useEffect(() => {
		fetchPodcastFeedUrl(topic.id)
			.then(setPodcastFeedUrl)
			.catch(() => setPodcastFeedUrl(null))
			.finally(() => setIsPodcastFeedUrlLoading(false))
	}, [topic.id])

	// the podcast app's link is the app's scheme, then the feed's url without its http scheme.
	// a private or invite topic's feed is the user's own
	const podcastAppLink =
		PODCAST_APP_LINKS[useBrowserValue(readBrowserPlatform, "other") as keyof typeof PODCAST_APP_LINKS]
	const podcastFeedUrlWithoutScheme = podcastFeedUrl?.replace(/^https?:\/\//, "")
	const isOwnPodcastFeed = topic.visibility !== "public"

	// report a subscribe click by its channel, naming the topic only if it is public
	const captureSubscribeClick = (channel: "app" | "copy-link"): void =>
		captureVisitEvent("visit_podcast_subscribe_clicked", { channel, ...toPublicTopicProperties(topic) })

	// copy the podcast feed's url
	const handleCopyPodcastFeedUrl = async (): Promise<void> => {
		captureSubscribeClick("copy-link")
		if (podcastFeedUrl) {
			await navigator.clipboard.writeText(podcastFeedUrl)
			toast("Feed link copied.")
		}
	}

	// replace the user's feed url with a new url. the old url stops working
	const handleResetPodcastFeed = async (): Promise<void> => {
		const newPodcastFeedUrl = await sendResetPodcastFeed(topic.id)
		if (!newPodcastFeedUrl) {
			toast.error("The link did not change. Try again.")
			return
		}

		// show the new url
		setPodcastFeedUrl(newPodcastFeedUrl)
		toast("New link made. The old one stopped working.")
	}
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				{/* the title and the description */}
				<DialogTitle>Subscribe to Coffee Break</DialogTitle>
				<DialogDescription>
					{`New episodes of ${topic.name} show up in your podcast app as Carl and Vienna record them.`}
				</DialogDescription>
				{/* the loading line, then the line for a feed that did not load */}
				{isPodcastFeedUrlLoading && <p className="shimmer-text text-sm">Carl is finding the feed…</p>}
				{!isPodcastFeedUrlLoading && !podcastFeedUrl && (
					<p className="text-muted-foreground text-sm">{"Carl couldn't find this topic's feed. Try again in a bit."}</p>
				)}
				{podcastFeedUrl && (
					<div className="flex flex-col gap-3">
						{/* the link that opens the device's podcast app, on iOS and Android */}
						{podcastAppLink && (
							<AnchorLink
								href={`${podcastAppLink.scheme}${podcastFeedUrlWithoutScheme}`}
								onClick={() => captureSubscribeClick("app")}
								className={buttonVariants({ variant: "default" })}
							>
								<Podcast className="size-4.5" />
								{podcastAppLink.label}
							</AnchorLink>
						)}
						{/* the button that copies the feed link, and where to paste the link */}
						<Button variant="outline" onClick={() => void handleCopyPodcastFeedUrl()}>
							<Copy className="size-4.5" />
							Copy feed link
						</Button>
						<p className="text-muted-foreground text-xs">
							Paste it into Apple Podcasts, Overcast, Pocket Casts, Castro, or AntennaPod, wherever the app adds a show
							by its link.
						</p>

						{/* the user's own feed url on a private or invite topic, and the button that resets the url */}
						{isOwnPodcastFeed && (
							<div className="border-separator flex flex-col gap-2 border-t pt-3">
								<p className="text-muted-foreground text-xs">
									This link is yours alone. Anyone who has it can listen to this topic's episodes, so keep it to
									yourself.
								</p>
								<p className="bg-muted/60 rounded-md px-2 py-1.5 text-xs break-all">{podcastFeedUrl}</p>
								<Button variant="ghost" size="sm" className="self-end" onClick={() => void handleResetPodcastFeed()}>
									Reset my link
								</Button>
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
