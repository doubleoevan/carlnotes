import type { TopicResponse } from "@shared/contracts"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TeamLink } from "@/components/team/TeamLink"
import { TopicInfoPopover } from "@/components/topic/Topic"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS } from "@/lib/styleClasses"
import { cn, toSubscribeTooltip } from "@/lib/utils"
import { setChatPanelState } from "@/stores/chatPanelStore"

/**
 * the topic header: the title with its chat mention badge, then its tags
 */
export function TopicHeader({ topic }: { topic: TopicResponse }) {
	// both the heading and its note icon open the note and show the hint, so the title holds the state the icon reads
	const [isNoteOpen, setNoteOpen] = useState(false)
	const [isNoteHintOpen, setNoteHintOpen] = useState(false)
	return (
		<>
			{/* title row. the heading takes the whole width and wraps instead of truncating, and the note
			    icon sits in its own text so a wrapped title keeps the icon beside its last word */}
			<div className="mt-3">
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: the note icon in the heading is the keyboard path */}
				<h1
					onClick={() => setNoteOpen(true)}
					onMouseEnter={() => setNoteHintOpen(true)}
					onMouseLeave={() => setNoteHintOpen(false)}
					className="font-display min-w-0 cursor-pointer text-2xl leading-tight"
				>
					{/* the chat mention count sits on the name, and its click opens the chat instead of the title's note */}
					<span className="relative">
						{topic.name}
						<TopicMentionBadge
							topicId={topic.id}
							onClick={(event) => {
								// the click opens the chat in place, never the link or the title's note
								event.preventDefault()
								event.stopPropagation()
								setChatPanelState("open")
							}}
							onMouseEnter={() => setTimeout(() => setNoteHintOpen(false), 0)}
							className="-right-2"
						/>
					</span>
					<TopicInfoPopover
						topic={topic}
						isInline
						isOpen={isNoteOpen}
						onOpenChange={setNoteOpen}
						isHintOpen={isNoteHintOpen}
						onHintOpenChange={setNoteHintOpen}
					/>
				</h1>
			</div>
			{/* the credit is derived: the team for anyone who can open its page, the creator otherwise */}
			<div className="mt-2">
				{topic.teamLink ? (
					<TeamLink team={topic.teamLink} className="text-sm" />
				) : (
					topic.owner && <UserProfileLink user={topic.owner} label="Brewed by" className="text-sm" />
				)}
			</div>
			{/* tags row, left out entirely by an untagged topic so there is no empty gap */}
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

/**
 * Whether the Follow button renders: an owner has nothing to follow, and a private topic has no followers.
 */
export function isFollowShown(topic: Pick<TopicResponse, "isOwner" | "visibility">): boolean {
	return !topic.isOwner && topic.visibility !== "private"
}

// the Follow button, subscribe in every identifier
export function SubscribeButton({
	topic,
	isSignedIn,
	isHighlighted,
	onToggle,
}: {
	topic: TopicResponse
	isSignedIn: boolean
	// whether this button is the page's one call to action, which decides its fill
	isHighlighted?: boolean
	onToggle: () => void
}) {
	if (!isFollowShown(topic)) {
		return null
	}
	const tooltip = toSubscribeTooltip(isSignedIn, topic.isSubscribed, topic.visibility === "invite")
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-pressed={topic.isSubscribed}
					onClick={onToggle}
					className={cn(MENU_BUTTON_CLASS, isHighlighted && MENU_BUTTON_HIGHLIGHT_CLASS)}
				>
					{/* the paw is an outline until subscribed, then fills, matching the homepage topic row */}
					<PawPrint className={cn("size-4", topic.isSubscribed && "text-primary fill-current")} />
					{topic.isSubscribed ? "Unfollow" : "Follow"}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
