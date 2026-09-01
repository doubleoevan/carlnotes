import { Check, Flag, Link, Rss, Share, Share2 } from "lucide-react"
import { useState } from "react"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	CopyLinkOption,
	DisabledShareOption,
	INVITE_LABEL,
	POST_PLATFORM_TARGETS,
	SEND_TARGETS,
	SHARE_OPTION_CLASS,
	SHARE_OPTION_ICON_CLASS,
	ShareTargetOptions,
} from "@/components/share/ShareOptions"
import { useShareTopicActions } from "@/components/share/useShareTopicActions"
import { canOpenShareSheet } from "@/lib/shareSheet"

// what a disabled share option says, which names the owner's way to fix it
function toDisabledReason(isTopicOwner?: boolean): string {
	return isTopicOwner ? "Make this topic public to post it" : "This topic must be public to post it"
}

// the row that shares an invite link, relabeled once a clipboard copy lands
function InviteShareOption({ isCopied, onShare }: { isCopied: boolean; onShare: () => Promise<void> }) {
	return (
		<button type="button" onClick={() => void onShare()} className={SHARE_OPTION_CLASS}>
			{isCopied ? <Check className={SHARE_OPTION_ICON_CLASS} /> : <Share className={SHARE_OPTION_ICON_CLASS} />}
			{isCopied ? "Link copied" : INVITE_LABEL}
		</button>
	)
}

/**
 * The Share dialog for a Topic, opened from the actions menu or ShareTopicButton. It shares the topic's page,
 * which can only be opened by a non-subscriber if the topic is public. A private topic's rows are disabled with a call to action.
 * A topic subscriber also gets the invite row, which provides a link to subscribe to the topic.
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
	topic: { id: string; name: string; visibility: string; isOwner?: boolean }
	className?: string
	// the homepage topic card shows the share icon alone instead of the labeled button
	isIcon?: boolean
	// the topic page opens these options as a dialog from its actions menu, which has no trigger of its own
	isDialog?: boolean
	onClose?: () => void
	// the callback that the owner gets to save the topic as public
	onMakeTopicPublic?: () => void
}) {
	const { id: topicId, name: topicName, isOwner: isTopicOwner } = topic
	const isPublic = topic.visibility === "public"
	// only the owner of a non-private topic can offer an invite link
	const canInvite = isTopicOwner && topic.visibility !== "private"
	// controlled so the report issue option can close the menu
	const [isOpen, setIsOpen] = useState(false)
	const [isReportingIssue, setIsReportingIssue] = useState(false)
	const handleReportIssue = (): void => {
		setIsOpen(false)
		setIsReportingIssue(true)
	}

	// read once on mount, so the share sheet is only shown if available
	const [isShareSheetAvailable] = useState(canOpenShareSheet)

	// the absolute url a platform needs, encoded once for use inside a query string
	const topicUrl = `${window.location.origin}/topics/${topicId}`
	const feedUrl = `${topicUrl}/feed.xml`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(topicUrl), encodeURIComponent(topicName)]
	// the topic actions for the rows below, which close this menu once a share actually lands
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

	// the sheet option only exists where a sheet can open, and only for someone who may invite
	const isInviteRowShown = Boolean(canInvite && isShareSheetAvailable)

	// the props every platform option requires
	const shareTargetProps = {
		isPublic,
		encodedUrl,
		encodedTitle,
		reason: disabledReason,
		onDisabledOptionClick: handleDisabledOptionClick,
	}

	// one set of options, whether they open from the feed card's popover or the topic page's dialog
	const shareOptions = (
		<>
			<ShareTargetOptions shareTargets={POST_PLATFORM_TARGETS} {...shareTargetProps} />
			{/* a divider above the options that share the topic to one person instead of posting it */}
			<div className="bg-border my-1 h-px" />
			{/* the only option providing an invite link that subscribes to the topic instead of the topic's url */}
			{isInviteRowShown && <InviteShareOption isCopied={copiedLabel === INVITE_LABEL} onShare={shareInvite} />}
			{/* the device's share sheet is above the send options if one can open */}
			{isShareSheetAvailable &&
				(isPublic ? (
					<button type="button" onClick={() => void shareTopic()} className={SHARE_OPTION_CLASS}>
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
			<ShareTargetOptions shareTargets={SEND_TARGETS} {...shareTargetProps} />
			{/* the copy link option sits under a divider */}
			<div className="bg-border my-1 h-px" />
			<CopyLinkOption
				label="Copy link"
				icon={<Link className="size-4" />}
				className={SHARE_OPTION_CLASS}
				isCopied={copiedLabel === "Copy link"}
				onCopy={() => copyLink("Copy link", topicUrl)}
			/>
			{/* an rss feed can only be served for a public topic */}
			{isPublic ? (
				<CopyLinkOption
					label="Copy RSS"
					icon={<Rss className="size-4" />}
					className={SHARE_OPTION_CLASS}
					isCopied={copiedLabel === "Copy RSS"}
					onCopy={() => copyLink("Copy RSS", feedUrl)}
				/>
			) : (
				<DisabledShareOption
					label="Copy RSS"
					icon={<Rss className="size-4" />}
					disabledReason={disabledReason}
					onClick={handleDisabledOptionClick}
				/>
			)}
			{/* a trigger for the report issue dialog from the home page icon only */}
			{isIcon && (
				<>
					<div className="bg-border my-1 h-px" />
					<button type="button" onClick={handleReportIssue} className={SHARE_OPTION_CLASS}>
						<Flag className="size-4" />
						Report issue
					</button>
				</>
			)}
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
				{/* the report issue dialog mounted when the report issue button is clicked */}
				{isReportingIssue && (
					<ReportIssueDialog
						subjectKind="topic"
						subjectId={topicId}
						subjectLabel={topicName}
						onClose={() => setIsReportingIssue(false)}
					/>
				)}
			</>
		)
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className={className} aria-label={`Share ${topicName}`}>
						<Share2 className={isIcon ? "size-3.75" : "size-4"} />
						{!isIcon && "Share"}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Share this topic</TooltipContent>
			</Tooltip>
			{/* nothing takes focus on open, so no option starts with the browser's focus ring */}
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				{shareOptions}
			</PopoverContent>
			{isReportingIssue && (
				<ReportIssueDialog
					subjectKind="topic"
					subjectId={topicId}
					subjectLabel={topicName}
					onClose={() => setIsReportingIssue(false)}
				/>
			)}
		</Popover>
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
	topic: { id: string; name: string; visibility: string; isOwner: boolean }
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
