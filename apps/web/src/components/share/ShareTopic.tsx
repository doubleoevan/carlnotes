import type { Visibility } from "@carlnotes/contracts/enums"
import { toTopicFeedPath, toTopicPath } from "@carlnotes/contracts/seo"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toReportImageLabel } from "@carlnotes/core/lib/socialLabels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Check, Flag, Link, Rss, Share } from "lucide-react"
import { useState } from "react"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useIsMounted, useOrigin } from "@/hooks/useBrowserValue"
import { canOpenShareSheet } from "@/lib/shareSheet"
import { ACTIVE_ICON_CLASS, MENU_DIVIDER_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
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

/**
 * The Share dialog for a Topic, opened from the actions menu or ShareTopicButton. It shares the topic's page,
 * which can only be opened by a non-subscriber if the topic is public. A private topic's options are disabled with a call to action.
 * A topic subscriber also gets the invite option, which provides a link to subscribe to the topic.
 */
export function ShareTopic({
	topic,
	className,
	isIcon,
	isDialog,
	onClose,
	onMakeTopicPublic,
}: {
	// the topic being shared. only a public topic can be posted, and only its owner can make it public
	topic: { id: string; name: string; visibility: Visibility; isTopicOwner?: boolean }
	className?: string
	// the homepage topic card shows the share icon alone instead of the labeled button
	isIcon?: boolean
	// the topic page opens these options as a dialog from its actions menu, which has no trigger of its own
	isDialog?: boolean
	onClose?: () => void
	// the callback that the owner gets to save the topic as public
	onMakeTopicPublic?: () => void
}) {
	const { id: topicId, name: topicName, isTopicOwner } = topic
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

	// the absolute topic and feed urls, with the topic url and title encoded once for use inside a query string
	const origin = useOrigin()
	const topicUrl = `${origin}${toTopicPath(topic)}`
	const feedUrl = `${origin}${toTopicFeedPath(topicId)}`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(topicUrl), encodeURIComponent(topicName)]
	// the topic actions for the options below, which close this menu once a share succeeds
	const { copiedLabel, copyLink, shareTopic, shareInvite } = useShareTopicActions(topicId, topicName, topicUrl, () =>
		setIsOpen(false),
	)

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

	// report a share by its channel, naming the topic only if it is public
	const handleShareOptionClick = (channel: string): void =>
		captureVisitEvent("visit_share_clicked", { kind: "topic", channel, ...toPublicTopicProperties(topic) })

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
					return copyLink(COPY_PAGE_LABEL, topicUrl)
				}}
			/>
			{/* an rss feed can only be served for a public topic */}
			{isPublic ? (
				<CopyLinkOption
					label="Copy RSS"
					icon={<Rss className="size-4" />}
					className={SHARE_OPTION_CLASS}
					isCopied={copiedLabel === "Copy RSS"}
					onCopy={() => {
						handleShareOptionClick("rss")
						return copyLink("Copy RSS", feedUrl)
					}}
				/>
			) : (
				<DisabledShareOption
					label="Copy RSS"
					icon={<Rss className="size-4" />}
					disabledReason={disabledReason}
					onClick={handleDisabledOptionClick}
				/>
			)}
			{/* the report options: the topic's report option shows on the feed card's icon alone, and the image's shows on both */}
			{(isIcon || isDialog) && <ReportTopicOptions topicId={topicId} isIcon={isIcon} onReport={handleReport} />}
		</>
	)

	if (isDialog) {
		return (
			<>
				<Dialog open onOpenChange={onClose}>
					{/* the tighter padding and gap keep the dialog to the popover's own density */}
					<DialogContent className="gap-2 p-4 sm:max-w-xs">
						<DialogTitle>Share topic</DialogTitle>
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
					<PopoverTrigger className={className} aria-label={`Share ${topicName}`}>
						<Share className={isIcon ? "size-3.75" : "size-4"} />
						{!isIcon && "Share"}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Share this topic</TooltipContent>
			</Tooltip>
			{/* nothing takes focus on open, so no option starts with the browser's focus ring */}
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				{shareOptions}
			</PopoverContent>
			{reportTopicDialog}
		</Popover>
	)
}

// what the share menu reports: the topic itself, or its image
type ReportedTopicSubjectKind = "topic" | "topicImage"

// the share menu's report options under their divider: the topic's report option shows on the feed card's icon alone,
// and the image's shows on both
function ReportTopicOptions({
	topicId,
	isIcon,
	onReport,
}: {
	topicId: string
	isIcon?: boolean
	onReport: (subjectKind: ReportedTopicSubjectKind) => void
}) {
	return (
		<>
			<div className={MENU_DIVIDER_CLASS} />
			{isIcon && <ReportTopicOption topicId={topicId} subjectKind="topic" onClick={() => onReport("topic")} />}
			<ReportTopicOption topicId={topicId} subjectKind="topicImage" onClick={() => onReport("topicImage")} />
		</>
	)
}

// the report dialog for the topic or its image, mounted while a report option's subject is set
function ReportTopicDialog({
	topic,
	subjectKind,
	onClose,
}: {
	topic: { id: string; name: string }
	subjectKind: ReportedTopicSubjectKind | null
	onClose: () => void
}) {
	if (!subjectKind) {
		return null
	}
	return (
		<ReportIssueDialog
			subjectKind={subjectKind}
			subjectId={topic.id}
			subjectLabel={subjectKind === "topicImage" ? `the image of ${topic.name}` : topic.name}
			onClose={onClose}
		/>
	)
}

// the share menu's report option for the topic or its image, which reads whether the user reported it as the menu opens
function ReportTopicOption({
	topicId,
	subjectKind,
	onClick,
}: {
	topicId: string
	subjectKind: ReportedTopicSubjectKind
	onClick: () => void
}) {
	const reportFlag = useSubjectReportFlag({ subjectKind, subjectId: topicId }, onClick)
	return (
		<button type="button" onClick={reportFlag.press} className={SHARE_OPTION_CLASS}>
			<Flag className={cn("size-4", reportFlag.isReported && ACTIVE_ICON_CLASS)} />
			{subjectKind === "topicImage" ? toReportImageLabel(reportFlag.isReported) : reportFlag.label}
		</button>
	)
}

/**
 * A Topic's share button for posting this topic to social platforms.
 */
export function ShareTopicButton({
	topic,
	className,
	isCompact,
	isDialog,
	onClose,
	onMakeTopicPublic,
}: {
	topic: { id: string; name: string; visibility: Visibility; isTopicOwner: boolean }
	className?: string
	isCompact?: boolean
	// the topic page opens the options as a dialog from its actions menu
	isDialog?: boolean
	onClose?: () => void
	// a click handler only passed in for the topic owner
	onMakeTopicPublic?: () => void
}) {
	return (
		<ShareTopic
			topic={topic}
			isIcon={isCompact}
			className={className}
			isDialog={isDialog}
			onClose={onClose}
			onMakeTopicPublic={onMakeTopicPublic}
		/>
	)
}
