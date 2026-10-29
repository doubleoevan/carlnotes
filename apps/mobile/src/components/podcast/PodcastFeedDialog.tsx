import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	type PodcastFeedDialogElements,
	PodcastFeedDialog as SharedPodcastFeedDialog,
} from "@carlnotes/core/components/PodcastFeedDialog"
import { usePodcastFeed } from "@carlnotes/core/hooks/usePodcastFeed"
import { toPodcastAppLink } from "@carlnotes/core/lib/podcastFeed"
import * as Clipboard from "expo-clipboard"
import * as Linking from "expo-linking"
import { Copy, Podcast } from "lucide-react-native"
import { type ComponentRef, type RefObject, useEffect, useRef, useState } from "react"
import { Platform, View } from "react-native"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Sheet } from "@/components/common/Sheet"
import { ShimmerText } from "@/components/common/ShimmerText"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { openPodcastFeed } from "@/podcastFeedActions"
import { captureVisitEvent, toPublicTopicProperties } from "@/visitAnalytics"

export const podcastFeedDialogElements: PodcastFeedDialogElements = {
	Group: View,
	Text: (props) => (props.className?.includes("shimmer-text") ? <ShimmerText {...props} /> : <Text {...props} />),
	Description: ({ children }) => <Text className="mb-4 text-sm text-muted-foreground">{children}</Text>,
	Strong: ({ children }) => <Text className="font-bold text-muted-foreground">{children}</Text>,
	Code: ({ children, className }) => (
		<Text selectable className={className}>
			{children}
		</Text>
	),
	Button: ({ children, icon, onPress, ...props }) => (
		<Button {...props} accessibilityLabel={String(children)} onPress={onPress}>
			{icon && <Icon as={icon === "copy" ? Copy : Podcast} className="size-4.5" />}
			<Text>{children}</Text>
		</Button>
	),
	Confirm: ConfirmDialog,
}

/**
 * Adapts the shared feed dialog to a sheet, system podcast apps, and the device clipboard.
 */
export function PodcastFeedDialog({
	topic,
	onClose,
	triggerRef,
}: {
	topic: Pick<TopicResponse, "id" | "name" | "visibility">
	onClose: () => void
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
}) {
	// scope private links to the currently signed-in account
	const { data: session } = authClient().useSession()
	const feed = usePodcastFeed({ topicId: topic.id, userId: session?.user.id ?? null })
	const appLink = feed.url ? toPodcastAppLink({ platform: Platform.OS, feedUrl: feed.url }) : null
	const [message, setMessage] = useState<string | null>(null)
	const identity = `${session?.user.id ?? "visitor"}/${topic.id}/${feed.url ?? ""}`
	const scope = useRef<{ controller: AbortController; identity: string } | null>(null)
	useEffect(() => {
		const controller = new AbortController()
		scope.current = { controller, identity }
		setMessage(null)
		return () => controller.abort()
	}, [identity])
	const handleCopy = async (): Promise<void> => {
		if (!feed.url) {
			return
		}
		try {
			captureVisitEvent("visit_podcast_subscribe_clicked", { channel: "copy-link", ...toPublicTopicProperties(topic) })
			await Clipboard.setStringAsync(feed.url)
			setMessage("Feed link copied.")
		} catch {
			showClientError("The feed link could not be copied. Try again.")
		}
	}
	const handleOpen = async (): Promise<void> => {
		const current = scope.current
		if (!feed.url || !current || current.identity !== identity) {
			return
		}
		captureVisitEvent("visit_podcast_subscribe_clicked", { channel: "app", ...toPublicTopicProperties(topic) })
		const isCurrent = (): boolean => !current.controller.signal.aborted
		const result = await openPodcastFeed({ feedUrl: feed.url, platform: Platform.OS, adapter: Linking, isCurrent })
		if (isCurrent()) {
			setMessage(result)
		}
	}

	return (
		<Sheet title="Subscribe to Coffee Break" triggerRef={triggerRef} onClose={onClose}>
			<SharedPodcastFeedDialog
				topicName={topic.name}
				feed={feed}
				isOwnFeed={topic.visibility !== "public"}
				appLabel={appLink?.label}
				onCopy={() => void handleCopy()}
				onOpenApp={() => void handleOpen()}
				elements={podcastFeedDialogElements}
			/>
			{message && (
				<Text accessibilityLiveRegion="polite" className="mt-3 text-sm text-muted-foreground">
					{message}
				</Text>
			)}
		</Sheet>
	)
}
