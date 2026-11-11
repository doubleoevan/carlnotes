import type { Visibility } from "@carlnotes/contracts/enums"
import { toTopicFeedPath, toTopicPath } from "@carlnotes/contracts/seo"
import { type SharedTopicPost, TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { Check, Link, Rss, Share } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useIsMounted, useOrigin } from "@/hooks/useBrowserValue"
import { canOpenShareSheet } from "@/lib/shareSheet"
import { MENU_DIVIDER_CLASS, PLAIN_PAGE_BUTTON_ICON_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { type ReportedTopicSubjectKind, ReportTopicDialog, ReportTopicOptions } from "./ReportTopicOptions"
import {
	COPY_PAGE_LABEL,
	CopyLinkOption,
	DisabledShareOption,
	INVITE_LABEL,
	INVITE_SHARE_LABEL,
	POST_PLATFORM_TARGETS,
	SEND_TARGETS,
	SHARE_OPTION_CLASS,
	SHARE_OPTION_ICON_CLASS,
	ShareTargetOptions,
} from "./ShareOptions"
import { useShareTopicActions } from "./useShareTopicActions"

// what a disabled share option shows, which names the owner's way to fix it
function toDisabledReason(isTopicOwner?: boolean): string {
	return isTopicOwner ? "Make this topic public to post it" : "This topic must be public to post it"
}

// the option that shares an invite link, relabeled once a clipboard copy succeeds
function InviteShareOption({
	isCopied,
	label,
	onShare,
}: {
	isCopied: boolean
	label: string
	onShare: () => Promise<void>
}) {
	return (
		<button type="button" onClick={() => void onShare()} className={SHARE_OPTION_CLASS}>
			{isCopied ? <Check className={SHARE_OPTION_ICON_CLASS} /> : <Share className={SHARE_OPTION_ICON_CLASS} />}
			{isCopied ? "Link copied" : label}
		</button>
	)
}

// what the options share: the topic's page, or the page of the Topic Post shared in the topic's place
type SharedPage = { kind: "topic" | "topicPost"; name: string; path: string; dialogTitle: string; tooltip: string }

// the page the options share, with the words that name it in the dialog's title and the button's tooltip
function toSharedPage(topic: { id: string; name: string }, topicPost: SharedTopicPost | undefined): SharedPage {
	if (topicPost) {
		return {
			kind: "topicPost",
			name: topicPost.title,
			path: topicPost.path,
			dialogTitle: TOPIC_POST_LABELS.shareTitle,
			tooltip: "Share this post",
		}
	}
	return {
		kind: "topic",
		name: topic.name,
		path: toTopicPath(topic),
		dialogTitle: "Share topic",
		tooltip: "Share this topic",
	}
}

// the option that copies a topic's rss feed, which can only be served for a public topic
function CopyRssOption({
	isPublic,
	isCopied,
	disabledReason,
	onCopy,
	onDisabledOptionClick,
}: {
	isPublic: boolean
	isCopied: boolean
	disabledReason: string
	onCopy: () => void
	onDisabledOptionClick?: () => void
}) {
	if (!isPublic) {
		return (
			<DisabledShareOption
				label="Copy RSS"
				icon={<Rss className="size-4" />}
				disabledReason={disabledReason}
				onClick={onDisabledOptionClick}
			/>
		)
	}
	return (
		<CopyLinkOption
			label="Copy RSS"
			icon={<Rss className="size-4" />}
			className={SHARE_OPTION_CLASS}
			isCopied={isCopied}
			onCopy={onCopy}
		/>
	)
}

/**
 * The Share dialog for a Topic, opened from the actions menu or its own share button. It shares the topic's page,
 * which can only be opened by a non-subscriber if the topic is public. A private topic's options are disabled with a
 * call to action. A topic subscriber also gets the invite option, which provides a link to subscribe to the topic.
 * Given a Topic Post, the same options share the post's page, and the invite link opens the post once it is accepted.
 */
export function ShareTopic({
	topic,
	topicPost,
	className,
	isIcon,
	isIconHighlighted,
	isDialog,
	onClose,
	onMakeTopicPublic,
}: {
	// the topic being shared. only a public topic can be posted, and only its owner can make it public
	topic: { id: string; name: string; visibility: Visibility; isTopicOwner?: boolean }
	// the topic's Topic Post that is shared in the topic's place: its page, its card, and an invite that opens it
	topicPost?: SharedTopicPost
	className?: string
	// the homepage topic card shows the share icon alone instead of the labeled button
	isIcon?: boolean
	// the labeled button at the left of a page's top row gives its icon the highlight color
	isIconHighlighted?: boolean
	// the topic page opens these options as a dialog from its actions menu, which has no trigger of its own
	isDialog?: boolean
	onClose?: () => void
	// the callback that the owner gets to save the topic as public
	onMakeTopicPublic?: () => void
}) {
	const { id: topicId, isTopicOwner } = topic
	const isPublic = topic.visibility === "public"
	// only the owner of a non-private topic can offer an invite link
	const canInviteTopic = isTopicOwner && topic.visibility !== "private"
	// the open state of the share menu
	const [isOpen, setIsOpen] = useState(false)
	const [reportingSubjectKind, setReportingSubjectKind] = useState<ReportedTopicSubjectKind | null>(null)
	const handleReport = (subjectKind: ReportedTopicSubjectKind): void => {
		setIsOpen(false)
		setReportingSubjectKind(subjectKind)
	}
	const reportTopicDialog = (
		<ReportTopicDialog topic={topic} subjectKind={reportingSubjectKind} onClose={() => setReportingSubjectKind(null)} />
	)

	// whether this browser can open a share sheet, false until the component mounts in the browser
	const isShareSheetAvailable = useIsMounted() && canOpenShareSheet()

	// the shared page's name and absolute url, the post's if one is shared, and the topic's feed url. the page url and
	// name are encoded once for use inside a query string
	const origin = useOrigin()
	const sharedPage = toSharedPage(topic, topicPost)
	const { name: sharedName } = sharedPage
	const sharedUrl = `${origin}${sharedPage.path}`
	const feedUrl = `${origin}${toTopicFeedPath(topicId)}`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(sharedUrl), encodeURIComponent(sharedName)]
	// the share actions for the options below, which close this menu once a share succeeds
	const { copiedLabel, copyLink, shareTopic, shareInvite } = useShareTopicActions({
		topicId,
		topicPostId: topicPost?.id,
		sharedName,
		sharedUrl,
		onShared: () => setIsOpen(false),
	})

	// a disabled option shows the user why and offers the owner a call-to-action
	const disabledReason = toDisabledReason(isTopicOwner)
	const handleDisabledOptionClick =
		isTopicOwner && onMakeTopicPublic
			? () => {
					setIsOpen(false)
					onMakeTopicPublic()
				}
			: undefined

	// the send options are enabled for any non-private topic
	const canShareTopic = topic.visibility !== "private"

	// report a share by its kind and its channel, naming the topic only if it is public
	const handleShareOptionClick = (channel: string): void =>
		captureVisitEvent("visit_share_clicked", {
			kind: sharedPage.kind,
			channel,
			...toPublicTopicProperties(topic),
		})

	// the props every platform option requires
	const shareTargetProps = {
		encodedUrl,
		encodedTitle,
		reason: disabledReason,
		onDisabledOptionClick: handleDisabledOptionClick,
		onPlatformOptionClick: handleShareOptionClick,
	}

	// one set of options, whether they open from the feed card's popover or the topic page's dialog
	const shareOptions = (
		<>
			<ShareTargetOptions shareTargets={POST_PLATFORM_TARGETS} isEnabled={isPublic} {...shareTargetProps} />
			{/* a divider above the options that share the topic to one person instead of posting it */}
			<div className={MENU_DIVIDER_CLASS} />
			{/* the only option providing an invite link that subscribes to the topic instead of the topic's url */}
			{canInviteTopic && (
				<InviteShareOption
					isCopied={copiedLabel === INVITE_LABEL}
					label={isShareSheetAvailable ? INVITE_SHARE_LABEL : INVITE_LABEL}
					onShare={() => {
						handleShareOptionClick("invite")
						return shareInvite()
					}}
				/>
			)}
			{/* the device's share sheet is above the send options if one can open */}
			{isShareSheetAvailable &&
				(canShareTopic ? (
					<button
						type="button"
						onClick={() => {
							handleShareOptionClick("share-sheet")
							void shareTopic()
						}}
						className={SHARE_OPTION_CLASS}
					>
						<Share className={SHARE_OPTION_ICON_CLASS} />
						Share…
					</button>
				) : (
					<DisabledShareOption
						label="Share…"
						icon={<Share className={SHARE_OPTION_ICON_CLASS} />}
						disabledReason={disabledReason}
						onClick={handleDisabledOptionClick}
					/>
				))}
			<ShareTargetOptions shareTargets={SEND_TARGETS} isEnabled={canShareTopic} {...shareTargetProps} />
			{/* the copy link option sits under a divider */}
			<div className={MENU_DIVIDER_CLASS} />
			<CopyLinkOption
				label={COPY_PAGE_LABEL}
				icon={<Link className="size-4" />}
				className={SHARE_OPTION_CLASS}
				isCopied={copiedLabel === COPY_PAGE_LABEL}
				onCopy={() => {
					handleShareOptionClick("copy-link")
					return copyLink(COPY_PAGE_LABEL, sharedUrl)
				}}
			/>
			{/* a topic's rss feed. a post has none */}
			{!topicPost && (
				<CopyRssOption
					isPublic={isPublic}
					isCopied={copiedLabel === "Copy RSS"}
					disabledReason={disabledReason}
					onCopy={() => {
						handleShareOptionClick("rss")
						void copyLink("Copy RSS", feedUrl)
					}}
					onDisabledOptionClick={handleDisabledOptionClick}
				/>
			)}
			{/* the report options: the topic's report option shows on the feed card's icon alone, and the image's shows on
			    both. a post's share has neither, since its page's menu reports its image */}
			{(isIcon || isDialog) && !topicPost && (
				<ReportTopicOptions topicId={topicId} isIcon={isIcon} onReport={handleReport} />
			)}
		</>
	)

	if (isDialog) {
		return (
			<>
				<Dialog open onOpenChange={onClose}>
					{/* the tighter padding and gap keep the dialog to the popover's own density */}
					<DialogContent className="gap-2 p-4 sm:max-w-xs">
						<DialogTitle>{sharedPage.dialogTitle}</DialogTitle>
						{/* one list, so the dialog's grid gap never falls between the options */}
						<div className="grid">{shareOptions}</div>
					</DialogContent>
				</Dialog>
				{/* the report dialog mounted when a report option is clicked */}
				{reportTopicDialog}
			</>
		)
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className={className} aria-label={`Share ${sharedName}`}>
						<Share className={toShareIconClass(isIcon, isIconHighlighted)} />
						{!isIcon && "Share"}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{sharedPage.tooltip}</TooltipContent>
			</Tooltip>
			{/* nothing takes focus on open, so no option starts with the browser's focus ring */}
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				{shareOptions}
			</PopoverContent>
			{reportTopicDialog}
		</Popover>
	)
}

// the share icon's classes: the card's small icon, the top row's icon in the highlight color, or the plain icon
function toShareIconClass(isIcon: boolean | undefined, isIconHighlighted: boolean | undefined): string {
	if (isIcon) {
		return "size-3.75"
	}
	return isIconHighlighted ? PLAIN_PAGE_BUTTON_ICON_CLASS : "size-4"
}
