import { Check, Flag, Link, Mail, MessageSquare, Panda, Rss } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandIcon } from "@/components/common/BrandIcon"
import { FlagContentDialog } from "@/components/common/FlagContentDialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn, copyThroughSelection } from "@/lib/utils"

// how long the copied confirmation stays up
const COPIED_FEEDBACK_MS = 1500

// one size for every icon in the menu, so the labels line up
const ROW_ICON_CLASS = "size-4 shrink-0"

// where a link to a Topic gets shared. the list stops short of the long tail on purpose
const SHARE_TARGETS = [
	{
		// "x.com" instead of "X", which on its own reads as a close button more than a place to post
		label: "x.com",
		icon: <BrandIcon brand="x" className={ROW_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://x.com/intent/post?url=${url}&text=${title}`,
	},
	{
		label: "Bluesky",
		icon: <BrandIcon brand="bluesky" className={ROW_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://bsky.app/intent/compose?text=${title}%20${url}`,
	},
	{
		label: "LinkedIn",
		icon: <BrandIcon brand="linkedin" className={ROW_ICON_CLASS} />,
		toUrl: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
	},
	{
		label: "Reddit",
		icon: <BrandIcon brand="reddit" className={ROW_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://reddit.com/submit?url=${url}&title=${title}`,
	},
	{
		label: "Email",
		icon: <Mail className={ROW_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `mailto:?subject=${title}&body=${url}`,
	},
	{
		label: "Text",
		icon: <MessageSquare className={ROW_ICON_CLASS} />,
		// "?&body=" instead of either separator alone, since that is the one spelling both ios and android open
		toUrl: (url: string, title: string) => `sms:?&body=${title}%20${url}`,
	},
]

/**
 * The share control on a Topic: where a link gets shared, the link itself, and the feed. The copy
 * rows write to the clipboard, since a feed url is pasted into a reader instead of followed.
 */
export function ShareTopic({
	topicId,
	topicName,
	className,
	isCompact,
	isPublic,
	isOwner,
	onMakeTopicPublic,
}: {
	topicId: string
	topicName: string
	className?: string
	// the homepage topic row shows the panda icon instead of the button
	isCompact?: boolean
	// only a public topic can be shared
	isPublic: boolean
	// the owner gets a call-to-action tooltip and a button to make the topic public
	isOwner?: boolean
	// the callback that the owner gets to save the topic as public
	onMakeTopicPublic?: () => void
}) {
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
	// controlled so the report row can close the menu under the flag dialog it opens
	const [isOpen, setIsOpen] = useState(false)
	const [isFlagging, setIsFlagging] = useState(false)
	const handleFlagClick = (): void => {
		setIsOpen(false)
		setIsFlagging(true)
	}

	// the absolute urls a platform needs, encoded once for use inside a query string
	const topicUrl = `${window.location.origin}/topics/${topicId}`
	const feedUrl = `${topicUrl}/feed.xml`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(topicUrl), encodeURIComponent(topicName)]

	// copy, then say so on the row that was clicked. some browsers refuse the clipboard api even over https,
	// so a rejected copy falls back, and the row confirms only once something was actually copied
	async function handleCopy(label: string, text: string): Promise<void> {
		let isCopied = true
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			isCopied = copyThroughSelection(text)
		}
		if (isCopied) {
			setCopiedLabel(label)
			setTimeout(() => setCopiedLabel(null), COPIED_FEEDBACK_MS)
		}
	}

	// disabled share options show the owner a call-to-action tooltip with a click handler to make the topic public
	const rowClassName = "hover:bg-accent flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm"
	const disabledReason = isOwner ? "Make this topic public to post it" : "This topic must be public to post it"
	const handleDisabledClick =
		isOwner && onMakeTopicPublic
			? () => {
					setIsOpen(false)
					onMakeTopicPublic()
				}
			: undefined
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className={className} aria-label={`Share ${topicName}`}>
						<Panda className={isCompact ? "size-3.75" : "size-4"} />
						{!isCompact && "Share"}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Share this topic</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-52 p-1">
				{/* only public topics can be shared */}
				{SHARE_TARGETS.map((target) =>
					isPublic ? (
						<AnchorLink key={target.label} href={target.toUrl(encodedUrl, encodedTitle)} className={rowClassName}>
							{target.icon}
							{target.label}
						</AnchorLink>
					) : (
						<DisabledRow
							key={target.label}
							label={target.label}
							icon={target.icon}
							reason={disabledReason}
							onClick={handleDisabledClick}
						/>
					),
				)}
				{/* the copy rows sit under a rule, since they don't take you to another platform */}
				<div className="bg-border my-1 h-px" />
				{/* the link keeps working on an invite topic, since that is what an invitee opens */}
				<CopyRow
					label="Copy link"
					icon={<Link className="size-4" />}
					className={rowClassName}
					isCopied={copiedLabel === "Copy link"}
					onCopy={() => handleCopy("Copy link", topicUrl)}
				/>
				{/* an rss feed can only be served for a public topic */}
				{isPublic ? (
					<CopyRow
						label="Copy RSS"
						icon={<Rss className="size-4" />}
						className={rowClassName}
						isCopied={copiedLabel === "Copy RSS"}
						onCopy={() => handleCopy("Copy RSS", feedUrl)}
					/>
				) : (
					<DisabledRow
						label="Copy RSS"
						icon={<Rss className="size-4" />}
						reason={disabledReason}
						onClick={handleDisabledClick}
					/>
				)}
				{/* reporting sits under its own rule, since it is the one row here that is not about passing the topic on */}
				<div className="bg-border my-1 h-px" />
				<button type="button" onClick={handleFlagClick} className={rowClassName}>
					<Flag className="size-4" />
					Report topic
				</button>
			</PopoverContent>
			{isFlagging && (
				<FlagContentDialog
					subjectKind="topic"
					subjectId={topicId}
					subjectLabel={topicName}
					onClose={() => setIsFlagging(false)}
				/>
			)}
		</Popover>
	)
}

/**
 * A Topic's share control for posting this topic to social platforms.
 */
export function TopicShareButton({
	topic,
	className,
	isCompact,
	onMakeTopicPublic,
}: {
	topic: { id: string; name: string; visibility: string; isOwner: boolean }
	className?: string
	isCompact?: boolean
	// a click handler only passed in for the topic owner
	onMakeTopicPublic?: () => void
}) {
	return (
		<ShareTopic
			topicId={topic.id}
			topicName={topic.name}
			isPublic={topic.visibility === "public"}
			isOwner={topic.isOwner}
			isCompact={isCompact}
			className={className}
			onMakeTopicPublic={onMakeTopicPublic}
		/>
	)
}

// a share row that is disabled for a topic that is not public.
// only an owner can make the topic public with a call-to-action tooltip and a click handler
function DisabledRow({
	label,
	icon,
	reason,
	onClick,
}: {
	label: string
	icon?: React.ReactNode
	reason: string
	// only passed in for the topic owner
	onClick?: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-disabled={onClick ? undefined : "true"}
					onClick={onClick}
					className={cn(
						"text-muted-foreground/60 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm",
						onClick ? "hover:bg-accent cursor-pointer" : "cursor-not-allowed",
					)}
				>
					{icon}
					{label}
				</button>
			</TooltipTrigger>
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
	)
}

// the clipboard option, which confirms in place
function CopyRow({
	label,
	icon,
	className,
	isCopied,
	onCopy,
}: {
	label: string
	icon?: React.ReactNode
	className?: string
	isCopied: boolean
	onCopy: () => void
}) {
	return (
		<button type="button" onClick={onCopy} className={cn(className, isCopied && "text-primary")}>
			{icon}
			{isCopied ? "Copied" : label}
			{isCopied && <Check className="ml-auto size-4" />}
		</button>
	)
}
