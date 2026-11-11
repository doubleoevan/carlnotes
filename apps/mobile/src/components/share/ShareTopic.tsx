import { showClientError } from "@carlnotes/client/apiClient"
import { sendCreateTopicInvite } from "@carlnotes/client/topicClient"
import { toInvitePath, toTopicFeedPath, toTopicPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toReportDialogTitle } from "@carlnotes/core/lib/reportCopy"
import { toReportImageLabel } from "@carlnotes/core/lib/socialLabels"
import { type SharedTopicPost, TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import { ICON_ACTION_CLASS } from "@carlnotes/nightshift/iconAction"
import { useRecyclingState } from "@shopify/flash-list"
import { Check, Flag, Link, Rss, Share as ShareIcon } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Platform, Pressable, Share, View } from "react-native"
import { toActiveIconProps } from "@/activeIconProps"
import { ReportIssueForm } from "@/components/common/ReportIssueDialog"
import { Sheet, type SheetProps } from "@/components/common/Sheet"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SHARE_TOPIC_LABEL } from "@/components/search/pageActionOptions"
import {
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"
import { captureVisitEvent, toPublicTopicProperties } from "@/visitAnalytics"
import { ShareTargets } from "./ShareTargets"

// visibility governs each option without hiding the share menu itself
type ShareTopicDetails = Pick<TopicDetails, "id" | "name" | "visibility"> & Partial<Pick<TopicDetails, "isTopicOwner">>

// the topic, and the Topic Post of it that is shared in the topic's place: its page, its card, and an invite that
// opens it
type ShareTopicSubject = { topic: ShareTopicDetails; topicPost?: SharedTopicPost }

/**
 * Opens the web's Topic sharing choices in a native sheet. Given a Topic Post, the same choices share the post.
 */
export function ShareTopic({
	topic,
	topicPost,
	isLabeled = false,
	isIconHighlighted = false,
}: ShareTopicSubject & {
	isLabeled?: boolean
	// the labeled button at the left of a screen's top row gives its icon the highlight color
	isIconHighlighted?: boolean
}) {
	// discard an open menu when its feed cell is recycled
	const [isOpen, setIsOpen] = useRecyclingState(false, [topic.id])
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const shareLabel = `Share ${topicPost?.title ?? topic.name}`
	return (
		<>
			{isLabeled ? (
				<Button
					ref={triggerRef}
					variant="outline"
					className={isIconHighlighted ? PLAIN_PAGE_BUTTON_CLASS : "bg-muted active:bg-accent"}
					accessibilityLabel={shareLabel}
					accessibilityState={{ expanded: isOpen }}
					onPress={() => setIsOpen(true)}
				>
					<Icon as={ShareIcon} className={isIconHighlighted ? PLAIN_PAGE_BUTTON_ICON_CLASS : undefined} />
					<Text className={isIconHighlighted ? PLAIN_PAGE_BUTTON_TEXT_CLASS : undefined}>Share</Text>
				</Button>
			) : (
				<Pressable
					ref={triggerRef}
					className={cn("min-h-11 items-center justify-center active:opacity-75", ICON_ACTION_CLASS)}
					hitSlop={toTouchTargetHitSlop(28)}
					accessibilityRole="button"
					accessibilityLabel={shareLabel}
					accessibilityState={{ expanded: isOpen }}
					onPress={() => setIsOpen(true)}
				>
					<Icon as={ShareIcon} className="size-3.75 text-muted-foreground" />
				</Pressable>
			)}
			{isOpen ? (
				<ShareTopicSheet topic={topic} topicPost={topicPost} triggerRef={triggerRef} onClose={() => setIsOpen(false)} />
			) : null}
		</>
	)
}

/**
 * Provides social destinations, native sharing, invite sharing, and clipboard links, for a Topic or for a Topic Post
 * shared in its place.
 */
export function ShareTopicSheet({
	topic,
	topicPost,
	...sheetProps
}: ShareTopicSubject & Pick<SheetProps, "triggerRef" | "onClose">) {
	// the share actions, and the report of a share by its kind and its channel
	const actions = useShareTopicActions({ topic, topicPost })
	const handleShare = (channel: string): void =>
		captureVisitEvent("visit_share_clicked", { kind: actions.sharedKind, channel, ...toPublicTopicProperties(topic) })
	const reportFlag = useSubjectReportFlag({ subjectKind: "topic", subjectId: topic.id })
	const imageReportFlag = useSubjectReportFlag({ subjectKind: "topicImage", subjectId: topic.id })

	// the sheet turns into the report form for the topic or its image once either report option is pressed
	const reportingSubjectKind = reportFlag.isReporting ? "topic" : imageReportFlag.isReporting ? "topicImage" : null
	const reportingSubjectLabel = reportingSubjectKind === "topicImage" ? `the image of ${topic.name}` : topic.name
	return (
		<Sheet
			title={reportingSubjectKind ? toReportDialogTitle(reportingSubjectLabel) : actions.shareTitle}
			{...sheetProps}
		>
			{reportingSubjectKind ? (
				<ReportIssueForm subjectKind={reportingSubjectKind} subjectId={topic.id} onClose={sheetProps.onClose} />
			) : (
				<>
					{/* public posts, followed by private send options */}
					<ShareTargets
						topic={{ name: actions.sharedName }}
						topicUrl={actions.sharedUrl}
						kind="post"
						isEnabled={actions.isPublic}
						onShare={handleShare}
					/>
					{!actions.isPublic ? (
						<Text className="px-2 py-2 text-xs text-muted-foreground">This topic must be public to post it.</Text>
					) : null}
					<View className="my-1 border-t border-separator" />
					{topic.isTopicOwner && actions.canSend ? (
						<ShareOption
							label="Share invite link"
							icon={ShareIcon}
							isDisabled={actions.isSharingInvite}
							onPress={() => {
								handleShare("invite")
								void actions.handleShareInvite()
							}}
						/>
					) : null}
					<ShareOption
						label="Share…"
						icon={ShareIcon}
						isDisabled={!actions.canSend}
						onPress={() => {
							handleShare("share-sheet")
							void shareTopicUrl({ title: actions.sharedName, url: actions.sharedUrl })
						}}
					/>
					<ShareTargets
						topic={{ name: actions.sharedName }}
						topicUrl={actions.sharedUrl}
						kind="send"
						isEnabled={actions.canSend}
						onShare={handleShare}
					/>
					{/* copy feedback stays beside the option that succeeded */}
					<View className="my-1 border-t border-separator" />
					<ShareOption
						label="Copy page link"
						icon={Link}
						isCopied={actions.copiedLabel === "page"}
						onPress={() => {
							handleShare("copy-link")
							void actions.handleCopy({ label: "page", url: actions.sharedUrl })
						}}
					/>
					{/* a topic's rss feed. a post has none */}
					{!topicPost && (
						<ShareOption
							label="Copy RSS"
							icon={Rss}
							isDisabled={!actions.isPublic}
							isCopied={actions.copiedLabel === "rss"}
							onPress={() => {
								handleShare("rss")
								void actions.handleCopy({ label: "rss", url: `${SITE_URL}${toTopicFeedPath(topic.id)}` })
							}}
						/>
					)}
					{actions.copyFallback ? (
						<View className="gap-2 p-2">
							<Text className="text-sm text-muted-foreground">Touch and hold the link to copy.</Text>
							<Text selectable className="text-sm text-link">
								{actions.copyFallback}
							</Text>
						</View>
					) : null}
					{/* the topic's report options, which a post's share leaves out */}
					{!topicPost && (
						<>
							<View className="my-1 border-t border-separator" />
							<ShareOption
								label={reportFlag.label}
								icon={Flag}
								isActive={reportFlag.isReported}
								onPress={reportFlag.press}
							/>
							<ShareOption
								label={toReportImageLabel(imageReportFlag.isReported)}
								icon={Flag}
								isActive={imageReportFlag.isReported}
								onPress={imageReportFlag.press}
							/>
						</>
					)}
				</>
			)}
		</Sheet>
	)
}

// keep copy feedback and unfinished requests local to this opening
function useShareTopicActions({ topic, topicPost }: ShareTopicSubject): {
	sharedKind: "topic" | "topicPost"
	shareTitle: string
	sharedName: string
	sharedUrl: string
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

	// the shared page's name and url, the post's if one is shared in the topic's place
	const sharedName = topicPost?.title ?? topic.name
	const sharedUrl = `${SITE_URL}${topicPost?.path ?? toTopicPath(topic)}`

	// create and share an invite only when its owner chooses the action
	const handleShareInvite = async (): Promise<void> => {
		setIsSharingInvite(true)
		try {
			// create an invite only after its owner chooses the action. a post's invite opens the post once accepted
			const invite = await sendCreateTopicInvite(topic.id, "share-sheet", topicPost?.id)
			if (invite === "limited") {
				showClientError("Daily invite limit reached. It resets tomorrow.")
				return
			}
			await shareTopicUrl({ title: sharedName, url: `${SITE_URL}${toInvitePath(invite.token)}` })
		} catch {
			showClientError("That invite didn't get made. Try again.")
		} finally {
			setIsSharingInvite(false)
		}
	}
	return {
		sharedKind: topicPost ? "topicPost" : "topic",
		shareTitle: topicPost ? TOPIC_POST_LABELS.shareTitle : SHARE_TOPIC_LABEL,
		sharedName,
		sharedUrl,
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
	isActive = false,
}: {
	label: string
	icon: typeof Link
	onPress: () => void
	isDisabled?: boolean
	isCopied?: boolean
	isActive?: boolean
}) {
	return (
		<Button
			variant="ghost"
			className="min-h-12 justify-start px-2"
			accessibilityLabel={isCopied ? `${label}, copied` : label}
			accessibilityState={{ selected: isActive }}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={icon} {...toActiveIconProps(isActive, "size-4")} />
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
