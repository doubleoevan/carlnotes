import type { ChatMention, NoteBadge } from "@shared/contracts"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CountPill } from "@/components/common/CountPill"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"
import { useTeamMentions, useTopicMentions } from "@/stores/chatRoomStore"
import { usePageNoteBadges } from "@/stores/noteBadgeStore"

// how many lines either badge's tooltip lists before folding the rest into a count
const LISTED_TOOLTIP_LINES = 4

/**
 * The label a chat mention badge shows for one chat mention set.
 */
export function toChatLabel(chatMentions: ChatMention[]): string {
	return chatMentions.length === 1 ? "1 chat for you" : `${chatMentions.length} chats for you`
}

/**
 * The chat mention count shared by the badges and the Coffee Talk pill.
 */
export function ChatMentionCount({ chatMentions, className }: { chatMentions: ChatMention[]; className?: string }) {
	return <CountPill count={chatMentions.length} className={className} />
}

/**
 * The label an unread note badge shows.
 */
export function toNoteLabel(noteCount: number): string {
	return noteCount === 1 ? "1 unread note change" : `${noteCount} unread note changes`
}

// the label for one note's changes. an edit, some comments, or both
function toNoteChangeLabel(badge: NoteBadge): string {
	const comments = badge.unreadComments === 1 ? "1 new comment" : `${badge.unreadComments} new comments`
	if (badge.unreadEdits === 0) {
		return comments
	}
	return badge.unreadComments === 0 ? "edited" : `edited, ${comments}`
}

// the two numbers of every note in the set, summed
function toNoteCount(badges: NoteBadge[]): number {
	return badges.reduce((total, badge) => total + badge.unreadEdits + badge.unreadComments, 0)
}

/**
 * The unread note count beside a page's name, its tooltip naming each note and the page holding it.
 */
function NoteCountBadge({ badges, href }: { badges: NoteBadge[]; href: string }) {
	const noteCount = toNoteCount(badges)
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href={href} aria-label={toNoteLabel(noteCount)}>
					<CountPill count={noteCount} variant="outline" />
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>
				<p className="font-semibold">{toNoteLabel(noteCount)}</p>
				{badges.slice(0, LISTED_TOOLTIP_LINES).map((badge) => (
					<p key={badge.noteId}>
						<span className="font-semibold">{badge.noteName}</span>
						{` in ${badge.pageName}: ${toNoteChangeLabel(badge)}`}
					</p>
				))}
				{badges.length > LISTED_TOOLTIP_LINES && <p>{`and ${badges.length - LISTED_TOOLTIP_LINES} more`}</p>}
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * The chat mentions tooltip body. Each line names who wrote the chat mention and how it starts.
 */
export function ChatMentionsTooltipBody({ chatMentions }: { chatMentions: ChatMention[] }) {
	return (
		<TooltipContent>
			<p className="font-semibold">{toChatLabel(chatMentions)}</p>
			{chatMentions.slice(0, LISTED_TOOLTIP_LINES).map((chatMention, index) => (
				// the newest-first order is stable within one render, so the index is a safe key
				// biome-ignore lint/suspicious/noArrayIndexKey: the list is read-only and rebuilt whole
				<p key={index}>
					<span className="font-semibold">{chatMention.authorUsername}</span>
					{chatMention.isReply ? " replied to you: " : " mentioned you: "}
					{chatMention.excerpt}
				</p>
			))}
			{chatMentions.length > LISTED_TOOLTIP_LINES && <p>{`and ${chatMentions.length - LISTED_TOOLTIP_LINES} more`}</p>}
		</TooltipContent>
	)
}

/**
 * The chat mention and unread note badges at a name's top-right corner.
 */
export function TopicMentionBadge({
	topicId,
	teamId,
	href,
	onClick,
	onMouseEnter,
	className,
}: {
	// the chat room's topic, or null for a team's own chat room
	topicId: string | null
	// the team, for a badge that stands for a team's own chat room instead of a topic's
	teamId?: string
	// where the badge's click goes instead of the topic's chat room
	href?: string
	// a page title's badge opens the chat here instead of following the link
	onClick?: (event: React.MouseEvent) => void
	onMouseEnter?: () => void
	className?: string
}) {
	// the unread chat mentions for this page, already minus the chat rooms opened this session
	const topicMentions = useTopicMentions(topicId ?? "")
	const teamMentions = useTeamMentions(teamId ?? "")
	const unreadMentions = topicId ? topicMentions : teamMentions

	// the notes waiting on the same page, already minus the ones opened this session
	const noteBadges = usePageNoteBadges(topicId, teamId)
	if (unreadMentions.length === 0 && noteBadges.length === 0) {
		return null
	}

	// the page the notes are on
	const pageHref = href ?? `/topics/${topicId}`
	return (
		<span className={cn("absolute -top-2 -right-3.5 z-10 flex items-center gap-1", className)}>
			{/* the filled chat mention badge leads the pair, and the outline note badge follows it */}
			{unreadMentions.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<AnchorLink
							href={href ?? `/topics/${topicId}?chat=${unreadMentions[0]?.teamId}`}
							aria-label={toChatLabel(unreadMentions)}
							onClick={onClick}
							onMouseEnter={onMouseEnter}
						>
							<ChatMentionCount chatMentions={unreadMentions} />
						</AnchorLink>
					</TooltipTrigger>
					<ChatMentionsTooltipBody chatMentions={unreadMentions} />
				</Tooltip>
			)}
			{noteBadges.length > 0 && <NoteCountBadge badges={noteBadges} href={pageHref} />}
		</span>
	)
}
