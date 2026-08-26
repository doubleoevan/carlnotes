import { Check, Flag, Link, Rss, Share, Share2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendCreateTopicInvite, toInviteUrl } from "@/clients/topicClient"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	COPIED_FEEDBACK_MS,
	CopyLinkOption,
	DisabledShareOption,
	INVITE_LABEL,
	POST_PLATFORM_TARGETS,
	SEND_TARGETS,
	SHARE_OPTION_CLASS,
	SHARE_OPTION_ICON_CLASS,
	ShareTargetOptions,
} from "@/components/share/ShareOptions"
import { canOpenShareSheet, openShareSheet } from "@/lib/shareSheet"
import { copyWithDocument } from "@/lib/utils"

// what a disabled share option says, which names the owner's way to fix it
function toDisabledReason(isTopicOwner?: boolean): string {
	return isTopicOwner ? "Make this topic public to post it" : "This topic must be public to post it"
}

/**
 * The Share dialog for a Topic, opened from the actions menu or ShareTopicButton. It shares the topic's page,
 * which can only be opened by a non-subscriber if the topic is public. A private topic's rows are disabled with a call to action.
 * A topic subscriber also gets the invite row, which provides a link to subscribe to the topic.
 */
export function ShareTopic({
	topicId,
	topicName,
	className,
	isIcon,
	isPublic,
	isTopicOwner,
	canInvite,
	isDialog,
	onClose,
	onMakeTopicPublic,
}: {
	topicId: string
	topicName: string
	className?: string
	// the homepage topic card shows the share icon alone instead of the labeled button
	isIcon?: boolean
	// the topic page opens these options as a dialog from its actions menu, which has no trigger of its own
	isDialog?: boolean
	onClose?: () => void
	// only a public topic can be shared
	isPublic: boolean
	// the owner gets a call-to-action tooltip and a button to make the topic public
	isTopicOwner?: boolean
	// whether this user may provide an invite to this topic, which is the topic owner or an admin
	canInvite?: boolean
	// the callback that the owner gets to save the topic as public
	onMakeTopicPublic?: () => void
}) {
	// controlled so the report issue option can close the menu
	const [isOpen, setIsOpen] = useState(false)
	const [isReportingIssue, setIsReportingIssue] = useState(false)
	const handleReportIssue = (): void => {
		setIsOpen(false)
		setIsReportingIssue(true)
	}

	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
	// read once on mount, so the share sheet is only shown if available
	const [isShareSheetAvailable] = useState(canOpenShareSheet)

	// the absolute url a platform needs, encoded once for use inside a query string
	const topicUrl = `${window.location.origin}/topics/${topicId}`
	const feedUrl = `${topicUrl}/feed.xml`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(topicUrl), encodeURIComponent(topicName)]

	// copy a link to the topic to the clipboard and show a confirmation label
	async function handleCopyLink(label: string, text: string): Promise<void> {
		let isCopied = true
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			isCopied = copyWithDocument(text)
		}
		if (isCopied) {
			setCopiedLabel(label)
			setTimeout(() => setCopiedLabel(null), COPIED_FEEDBACK_MS)
		}
	}

	// pass the topic's url to the device's sheet. a rejected gesture falls back to the clipboard copy
	async function handleShareSheet(): Promise<void> {
		const shared = await openShareSheet({ title: topicName, text: `${topicName} on CarlNotes`, url: topicUrl })
		if (shared === "unavailable") {
			await handleCopyLink("Copy link", topicUrl)
			return
		}
		if (shared === "shared") {
			setIsOpen(false)
		}
	}

	// create the invite token inside the click handler and pass its invite url to the share sheet
	async function handleShareInvite(): Promise<void> {
		let invite: Awaited<ReturnType<typeof sendCreateTopicInvite>>
		try {
			invite = await sendCreateTopicInvite(topicId, "share-sheet")
		} catch (error) {
			console.error("invite create failed", error)
			toast.error("That invite didn't get made. Try again.")
			return
		}

		// a dismissed sheet is a decision, so only a rejected one falls back to the clipboard
		const inviteUrl = toInviteUrl(invite.token)
		const shared = await openShareSheet({
			title: topicName,
			text: `Join ${topicName} on CarlNotes`,
			url: inviteUrl,
		})
		if (shared === "unavailable") {
			await handleCopyLink(INVITE_LABEL, inviteUrl)
			return
		}
		if (shared === "shared") {
			setIsOpen(false)
		}
	}

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
			{isInviteRowShown && (
				<button type="button" onClick={() => void handleShareInvite()} className={SHARE_OPTION_CLASS}>
					{copiedLabel === INVITE_LABEL ? (
						<Check className={SHARE_OPTION_ICON_CLASS} />
					) : (
						<Share className={SHARE_OPTION_ICON_CLASS} />
					)}
					{copiedLabel === INVITE_LABEL ? "Link copied" : INVITE_LABEL}
				</button>
			)}
			{/* the device's share sheet is above the send options if one can open */}
			{isShareSheetAvailable &&
				(isPublic ? (
					<button type="button" onClick={() => void handleShareSheet()} className={SHARE_OPTION_CLASS}>
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
				onCopy={() => handleCopyLink("Copy link", topicUrl)}
			/>
			{/* an rss feed can only be served for a public topic */}
			{isPublic ? (
				<CopyLinkOption
					label="Copy RSS"
					icon={<Rss className="size-4" />}
					className={SHARE_OPTION_CLASS}
					isCopied={copiedLabel === "Copy RSS"}
					onCopy={() => handleCopyLink("Copy RSS", feedUrl)}
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
			<PopoverContent align="end" className="w-52 p-1" onOpenAutoFocus={(event) => event.preventDefault()}>
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
			topicId={topic.id}
			topicName={topic.name}
			isPublic={topic.visibility === "public"}
			isTopicOwner={topic.isOwner}
			canInvite={topic.isOwner && topic.visibility !== "private"}
			isIcon={isCompact}
			className={className}
			isDialog={isDialog}
			onClose={onClose}
			onMakeTopicPublic={onMakeTopicPublic}
		/>
	)
}
