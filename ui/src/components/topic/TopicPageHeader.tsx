import type { TopicResponse } from "@shared/contracts"
import { PawPrint, Pencil, Trash2 } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { NewCountInfo, TopicInfoPopover } from "@/components/topic/Topic"
import { cn, MENU_BUTTON_CLASS, RAIL_ICON_INSET, RAIL_TEXT_INSET, toSubscribeTooltip } from "@/lib/utils"

/**
 * the topic header: the title with its unread count and the owner's actions, then its tags
 */
export function TopicHeader({
	topic,
	onEdit,
	onDelete,
}: {
	topic: TopicResponse
	onEdit: () => void
	onDelete: () => void
}) {
	// the heading opens the note and shows its tooltip as well as the icon in it, so the title holds the state the icon reads
	const [isNoteOpen, setNoteOpen] = useState(false)
	const [isNoteHintOpen, setNoteHintOpen] = useState(false)
	return (
		<>
			{/* title row. the note icon sits in the heading's own text, so a title that wraps keeps the icon beside its last word */}
			<div className="mt-6 flex items-start justify-between gap-3">
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: the note icon in the heading is the keyboard path */}
				<h1
					onClick={() => setNoteOpen(true)}
					onMouseEnter={() => setNoteHintOpen(true)}
					onMouseLeave={() => setNoteHintOpen(false)}
					className="font-display min-w-0 cursor-pointer text-2xl leading-tight"
				>
					{topic.name}
					<TopicInfoPopover
						topic={topic}
						isInline
						isOpen={isNoteOpen}
						onOpenChange={setNoteOpen}
						isHintOpen={isNoteHintOpen}
						onHintOpenChange={setNoteHintOpen}
					/>
				</h1>
				{/* the unread count and the owner's actions share the far right of the title line. only an owner
				    gets the action icons, so a user's row ends in the count and takes the text inset instead */}
				<div className={cn(topic.isOwner ? RAIL_ICON_INSET : RAIL_TEXT_INSET, "flex shrink-0 items-center gap-1")}>
					{topic.newCount > 0 && <NewCountInfo topic={topic} />}
					<TopicActions topic={topic} onEdit={onEdit} onDelete={onDelete} />
				</div>
			</div>
			{/* the topic owner's avatar, username and profile link */}
			{topic.owner && <UserProfileLink user={topic.owner} label="Brewed by" className="mt-2 text-sm" />}
			{/* tags row, left out entirely by an untagged topic so it includes no empty gap */}
			{topic.tags.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1">
					{topic.tags.map((tag) => (
						<Badge key={tag} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			)}
		</>
	)
}

// the edit and delete actions, shown to whoever the gate says may use them
function TopicActions({ topic, onEdit, onDelete }: { topic: TopicResponse; onEdit: () => void; onDelete: () => void }) {
	if (!topic.canEdit) {
		return null
	}
	return (
		<div className="flex items-center gap-0.5">
			<IconButton tooltip="Edit this topic" onClick={onEdit}>
				<Pencil className="size-3.75" />
			</IconButton>
			<IconButton tooltip="Delete this topic" onClick={onDelete}>
				<Trash2 className="size-3.75" />
			</IconButton>
		</div>
	)
}

// the subscribe control, worded "Follow" on the button. it renders for a user on a public or invite topic,
// and the page's toggle handler routes a visitor to signup
export function SubscribeButton({
	topic,
	isSignedIn,
	onToggle,
}: {
	topic: TopicResponse
	isSignedIn: boolean
	onToggle: () => void
}) {
	if (topic.isOwner || topic.visibility === "private") {
		return null
	}
	const tooltip = toSubscribeTooltip(isSignedIn, topic.isSubscribed, topic.visibility === "invite")
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" aria-pressed={topic.isSubscribed} onClick={onToggle} className={MENU_BUTTON_CLASS}>
					{/* the paw is an outline until subscribed, then fills, matching the homepage topic row */}
					<PawPrint className={cn("size-4", topic.isSubscribed && "text-primary fill-current")} />
					{topic.isSubscribed ? "Unfollow" : "Follow"}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// an icon with an action tooltip
function IconButton({
	tooltip,
	isPressed,
	onClick,
	children,
}: {
	tooltip: string
	isPressed?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={tooltip}
					aria-pressed={isPressed}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground grid h-11 w-7 place-items-center sm:size-7"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
