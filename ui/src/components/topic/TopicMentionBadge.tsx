import type { ChatMention } from "@shared/contracts"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"
import { useTeamMentions, useTopicMentions } from "@/stores/chatRoomStore"

// how many mention lines the tooltip lists before folding the rest into a count
const LISTED_MENTIONS = 4

// what the badge's count and label say for one mention set
export function toChatLabel(mentions: ChatMention[]): string {
	return mentions.length === 1 ? "1 chat for you" : `${mentions.length} chats for you`
}

/**
 * The chat mention count shared by the badges and the Coffee Talk pill.
 */
export function ChatMentionCount({ chatMentions, className }: { chatMentions: ChatMention[]; className?: string }) {
	return (
		<span
			className={cn(
				"bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
				className,
			)}
		>
			{chatMentions.length > 9 ? "9+" : chatMentions.length}
		</span>
	)
}

/**
 * The tooltip body every chat mentions badge shows: who wrote each unseen mention and how it starts.
 */
export function ChatMentionsTooltipBody({ chatMentions }: { chatMentions: ChatMention[] }) {
	return (
		<TooltipContent>
			<p className="font-semibold">{toChatLabel(chatMentions)}</p>
			{chatMentions.slice(0, LISTED_MENTIONS).map((mention, index) => (
				// the newest-first order is stable within one render, so the index is a safe key
				// biome-ignore lint/suspicious/noArrayIndexKey: the list is read-only and rebuilt whole
				<p key={index}>
					<span className="font-semibold">{mention.authorUsername}</span>
					{mention.isReply ? " replied to you: " : " mentioned you: "}
					{mention.excerpt}
				</p>
			))}
			{chatMentions.length > LISTED_MENTIONS && <p>{`and ${chatMentions.length - LISTED_MENTIONS} more`}</p>}
		</TooltipContent>
	)
}

/**
 * The mention count at a name's top-right corner in the topic tables, the teams index, and the
 * topic and team page titles, shown while the user has unseen room mentions or replies there.
 * The tooltip lists who wrote each and how it starts. A table or index badge links to the page
 * with the chat still closed. A page title's badge opens the chat in place through onClick.
 * Opening the room is what clears it, and every badge for that room clears together.
 */
export function TopicMentionBadge({
	topicId,
	teamId,
	href,
	onClick,
	onMouseEnter,
	className,
}: {
	// the room's topic, or null for a team's own room
	topicId: string | null
	// the team, for a badge that stands for a team's own room instead of a topic's
	teamId?: string
	// where the badge's click goes instead of the topic's room, for a team link's badge
	href?: string
	// a page title's badge opens the chat here instead of following the link
	onClick?: (event: React.MouseEvent) => void
	// the topic page's title closes its note hint while the badge is hovered, so this tooltip shows alone
	onMouseEnter?: () => void
	// a header with an info note right of the name shifts the badge left, off the note
	className?: string
}) {
	// what the chat panel's poll knows, already minus the rooms opened this session
	const polledTopic = useTopicMentions(topicId ?? "")
	const polledTeam = useTeamMentions(teamId ?? "")
	const unseenMentions = topicId ? polledTopic : polledTeam
	if (unseenMentions.length === 0) {
		return null
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink
					href={href ?? `/topics/${topicId}?chat=${unseenMentions[0]?.teamId}`}
					aria-label={toChatLabel(unseenMentions)}
					className={cn("absolute -top-2 -right-3.5 z-10", className)}
					onClick={onClick}
					onMouseEnter={onMouseEnter}
				>
					<ChatMentionCount chatMentions={unseenMentions} />
				</AnchorLink>
			</TooltipTrigger>
			<ChatMentionsTooltipBody chatMentions={unseenMentions} />
		</Tooltip>
	)
}
