import type { ComponentType, ReactNode } from "react"
import type { PodcastFeedState } from "../hooks/usePodcastFeed"
import { PODCAST_FEED_RESET_DESCRIPTION, PODCAST_FEED_RESET_TITLE } from "../lib/podcastFeed"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PodcastFeedDialogElements = {
	Group: Container
	Text: Container
	Description: Container
	Strong: Container
	Code: Container
	Button: ComponentType<{
		children: ReactNode
		variant: "default" | "outline" | "ghost"
		icon?: "podcast" | "copy"
		onPress: () => void
		disabled?: boolean
		className?: string
	}>
	Confirm: ComponentType<{
		title: string
		children: ReactNode
		onConfirm: () => Promise<void>
		onClose: () => void
		confirmLabel: string
		cancelLabel: string
	}>
}

/**
 * Composes feed loading, subscription controls, private-link warning, and reset confirmation for both apps.
 */
export function PodcastFeedDialog({
	topicName,
	feed,
	isOwnFeed,
	appLabel,
	onOpenApp,
	onCopy,
	elements: { Group, Text, Description, Strong, Code, Button, Confirm },
}: {
	topicName: string
	feed: PodcastFeedState
	isOwnFeed: boolean
	appLabel?: string
	onOpenApp: () => void
	onCopy: () => void
	elements: PodcastFeedDialogElements
}) {
	return (
		<>
			{/* show identity */}
			<Description>
				New episodes of <Strong>{topicName}</Strong> show up in your podcast app as Carl and Vienna record them.
			</Description>
			{/* loading, absence, and request feedback */}
			{feed.isLoading && <Text className="shimmer-text text-sm">Carl is finding the feed…</Text>}
			{!feed.isLoading && !feed.url && (
				<Text className="text-muted-foreground text-sm">
					{"Carl couldn't find this topic's feed. Try again in a bit."}
				</Text>
			)}
			{feed.message && <Text className="text-muted-foreground text-sm">{feed.message}</Text>}
			{/* subscription actions and the account-owned private link */}
			{feed.url && (
				<Group className="flex flex-col gap-3">
					{appLabel && (
						<Button variant="default" icon="podcast" onPress={onOpenApp}>
							{appLabel}
						</Button>
					)}
					<Button variant="outline" icon="copy" onPress={onCopy}>
						Copy feed link
					</Button>
					<Text className="text-muted-foreground text-xs">
						Paste it into Apple Podcasts, Overcast, Pocket Casts, Castro, or AntennaPod, wherever the app adds a show by
						its link.
					</Text>
					{isOwnFeed && (
						<Group className="border-separator flex flex-col gap-2 border-t pt-3">
							<Text className="text-muted-foreground text-xs">
								This link is yours alone. Anyone who has it can listen to this topic's episodes, so keep it to yourself.
							</Text>
							<Code className="bg-muted/60 rounded-md px-2 py-1.5 text-xs break-all">{feed.url}</Code>
							<Button variant="ghost" className="self-end" onPress={feed.confirmReset} disabled={feed.isResetting}>
								Reset my link
							</Button>
						</Group>
					)}
				</Group>
			)}
			{/* confirm before replacing a private feed token */}
			{feed.isConfirmingReset && (
				<Confirm
					title={PODCAST_FEED_RESET_TITLE}
					confirmLabel="Reset my link"
					cancelLabel="Keep my link"
					onConfirm={feed.reset}
					onClose={feed.cancelReset}
				>
					{PODCAST_FEED_RESET_DESCRIPTION}
				</Confirm>
			)}
		</>
	)
}
