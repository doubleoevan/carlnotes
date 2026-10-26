import { showClientError } from "@carlnotes/client/apiClient"
import { sendCreateTopicInvite } from "@carlnotes/client/topicClient"
import { toInvitePath, toTopicFeedPath, toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { useRecyclingState } from "@shopify/flash-list"
import { Check, Flag, Link, Rss, Share2, Share as ShareIcon } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Platform, Pressable, Share, View } from "react-native"
import { Sheet, type SheetProps } from "@/components/common/Sheet"
import { WebFeatureButton } from "@/components/common/WebFeature"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ShareTargets } from "./ShareTargets"

// visibility governs each option without hiding the share menu itself
type ShareTopicDetails = Pick<TopicDetails, "id" | "name" | "visibility"> & Partial<Pick<TopicDetails, "isTopicOwner">>

/**
 * Opens the web's Topic sharing choices in a native sheet.
 */
export function ShareTopic({ topic, isLabeled = false }: { topic: ShareTopicDetails; isLabeled?: boolean }) {
	// discard an open menu when its feed cell is recycled
	const [isOpen, setIsOpen] = useRecyclingState(false, [topic.id])
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<>
			{isLabeled ? (
				<Button
					ref={triggerRef}
					variant="outline"
					className="bg-muted active:bg-accent"
					accessibilityLabel={`Share ${topic.name}`}
					accessibilityState={{ expanded: isOpen }}
					onPress={() => setIsOpen(true)}
				>
					<Icon as={Share2} />
					<Text>Share</Text>
				</Button>
			) : (
				<Pressable
					ref={triggerRef}
					className="min-h-11 w-7 items-center justify-center active:opacity-75"
					hitSlop={toTouchTargetHitSlop(28)}
					accessibilityRole="button"
					accessibilityLabel={`Share ${topic.name}`}
					accessibilityState={{ expanded: isOpen }}
					onPress={() => setIsOpen(true)}
				>
					<Icon as={Share2} className="size-3.75 text-muted-foreground" />
				</Pressable>
			)}
			{isOpen ? <ShareTopicSheet topic={topic} triggerRef={triggerRef} onClose={() => setIsOpen(false)} /> : null}
		</>
	)
}

/**
 * Provides social destinations, native sharing, invite sharing, and clipboard links.
 */
export function ShareTopicSheet({
	topic,
	...sheetProps
}: { topic: ShareTopicDetails } & Pick<SheetProps, "triggerRef" | "onClose">) {
	const actions = useShareTopicActions(topic)
	return (
		<Sheet title="Share topic" {...sheetProps}>
			{/* public posts, followed by private send options */}
			<ShareTargets topic={topic} topicUrl={actions.topicUrl} kind="post" isEnabled={actions.isPublic} />
			{!actions.isPublic ? (
				<Text className="px-2 py-2 text-xs text-muted-foreground">This topic must be public to post it.</Text>
			) : null}
			<View className="my-1 border-t border-separator" />
			{topic.isTopicOwner && actions.canSend ? (
				<ShareOption
					label="Share invite link"
					icon={ShareIcon}
					isDisabled={actions.isSharingInvite}
					onPress={() => void actions.handleShareInvite()}
				/>
			) : null}
			<ShareOption
				label="Share…"
				icon={ShareIcon}
				isDisabled={!actions.canSend}
				onPress={() => void shareTopicUrl({ title: topic.name, url: actions.topicUrl })}
			/>
			<ShareTargets topic={topic} topicUrl={actions.topicUrl} kind="send" isEnabled={actions.canSend} />
			{/* copy feedback stays beside the option that succeeded */}
			<View className="my-1 border-t border-separator" />
			<ShareOption
				label="Copy page link"
				icon={Link}
				isCopied={actions.copiedLabel === "page"}
				onPress={() => void actions.handleCopy({ label: "page", url: actions.topicUrl })}
			/>
			<ShareOption
				label="Copy RSS"
				icon={Rss}
				isDisabled={!actions.isPublic}
				isCopied={actions.copiedLabel === "rss"}
				onPress={() => void actions.handleCopy({ label: "rss", url: `${SITE_URL}${toTopicFeedPath(topic.id)}` })}
			/>
			{actions.copyFallback ? (
				<View className="gap-2 p-2">
					<Text className="text-sm text-muted-foreground">Touch and hold the link to copy.</Text>
					<Text selectable className="text-sm text-link">
						{actions.copyFallback}
					</Text>
				</View>
			) : null}
			<View className="my-1 border-t border-separator" />
			<WebFeatureButton
				title="Report issue"
				description="Report an issue from this topic’s actions menu on carlnotes.com."
				path={toTopicPath(topic)}
				icon={Flag}
				variant="ghost"
				className="min-h-12 justify-start px-2"
			/>
		</Sheet>
	)
}

// keep copy feedback and unfinished requests local to this opening
function useShareTopicActions(topic: ShareTopicDetails): {
	topicUrl: string
	isPublic: boolean
	canSend: boolean
	copiedLabel: string | null
	copyFallback: string | null
	isSharingInvite: boolean
	handleCopy: (options: { label: string; url: string }) => Promise<void>
	handleShareInvite: () => Promise<void>
} {
	// track feedback and the pending invite in this sheet's lifetime
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
	const [copyFallback, setCopyFallback] = useState<string | null>(null)
	const [isSharingInvite, setIsSharingInvite] = useState(false)

	// copy on supported clients and expose selectable text on older clients
	const handleCopy = async ({ label, url }: { label: string; url: string }): Promise<void> => {
		try {
			// load clipboard only when needed so older development clients can still open the menu
			const clipboard = await import("expo-clipboard")
			await clipboard.setStringAsync(url)
			setCopiedLabel(label)
			setCopyFallback(null)
		} catch {
			setCopyFallback(url)
		}
	}

	// create and share an invite only when its owner chooses the action
	const handleShareInvite = async (): Promise<void> => {
		setIsSharingInvite(true)
		try {
			// create an invite only after its owner chooses the action
			const invite = await sendCreateTopicInvite(topic.id, "share-sheet")
			if (invite === "limited") {
				showClientError("Daily invite limit reached. It resets tomorrow.")
				return
			}
			await shareTopicUrl({ title: topic.name, url: `${SITE_URL}${toInvitePath(invite.token)}` })
		} catch {
			showClientError("That invite didn't get made. Try again.")
		} finally {
			setIsSharingInvite(false)
		}
	}
	return {
		topicUrl: `${SITE_URL}${toTopicPath(topic)}`,
		isPublic: topic.visibility === "public",
		canSend: topic.visibility !== "private",
		copiedLabel,
		copyFallback,
		isSharingInvite,
		handleCopy,
		handleShareInvite,
	}
}

// render one menu action at the platform's touch-target height
function ShareOption({
	label,
	icon,
	onPress,
	isDisabled = false,
	isCopied = false,
}: {
	label: string
	icon: typeof Link
	onPress: () => void
	isDisabled?: boolean
	isCopied?: boolean
}) {
	return (
		<Button
			variant="ghost"
			className="min-h-12 justify-start px-2"
			accessibilityLabel={isCopied ? `${label}, copied` : label}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={icon} className="size-4" />
			<Text className="flex-1 text-left">{isCopied ? "Copied" : label}</Text>
			{isCopied ? <Icon as={Check} className="size-4 text-link" /> : null}
		</Button>
	)
}

// hand the selected url to the operating system without choosing a recipient
async function shareTopicUrl({ title, url }: { title: string; url: string }): Promise<void> {
	try {
		await Share.share(Platform.OS === "ios" ? { title, url } : { title, message: url })
	} catch {
		showClientError("That link didn't open. Carl suggests trying again.")
	}
}
