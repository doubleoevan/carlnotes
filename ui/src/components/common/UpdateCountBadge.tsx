import type { ChatMention, NoteBadge, TopicInviteBadge } from "@shared/contracts"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CountBadge } from "@/components/common/CountBadge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"
import { useTeamMentions, useTopicMentions } from "@/stores/chatRoomStore"
import { usePageNoteBadges } from "@/stores/noteBadgeStore"

// how many bullets a tooltip section lists before folding the rest into a count
const LISTED_TOOLTIP_LINE_COUNT = 4

// one bullet of a tooltip section, keyed by the thing it names
type TooltipLine = { key: string; line: React.ReactNode }

/**
 * Bolds a label in a tooltip: a user, a topic, a team, or a note.
 */
export function TooltipLabel({ children }: { children: string }) {
	return <span className="font-semibold">{children}</span>
}

// one tooltip section: its heading, then one bullet per line, the first four listed and the rest counted
function TooltipSection({ heading, tooltipLines }: { heading: string; tooltipLines: TooltipLine[] }) {
	return (
		<div>
			<p className="font-semibold">{heading}</p>
			<ul className="list-disc pl-4">
				{tooltipLines.slice(0, LISTED_TOOLTIP_LINE_COUNT).map(({ key, line }) => (
					<li key={key}>{line}</li>
				))}
			</ul>
			{tooltipLines.length > LISTED_TOOLTIP_LINE_COUNT && (
				<p>{`and ${tooltipLines.length - LISTED_TOOLTIP_LINE_COUNT} more`}</p>
			)}
		</div>
	)
}

/**
 * Labels a chat mention noteBadge for one chat mention set.
 */
export function toChatLabel(chatMentions: ChatMention[]): string {
	return chatMentions.length === 1 ? "1 chat for you" : `${chatMentions.length} chats for you`
}

// the chat mention bullets: who wrote each chat mention and how it starts
function toChatMentionLines(chatMentions: ChatMention[]): TooltipLine[] {
	return chatMentions.map((chatMention) => ({
		key: `${chatMention.teamId}-${chatMention.chatMessageId}`,
		line: (
			<>
				<TooltipLabel>{chatMention.authorUsername}</TooltipLabel>
				{chatMention.isReply ? " replied to you: " : " mentioned you: "}
				{chatMention.excerpt}
			</>
		),
	}))
}

/**
 * Labels an unread note noteBadge.
 */
export function toNoteLabel(noteCount: number): string {
	return noteCount === 1 ? "1 unread note change" : `${noteCount} unread note changes`
}

// the label for one note's changes. an edit, some comments, or both
function toNoteChangeLabel(noteBadge: NoteBadge): string {
	const comments = noteBadge.unreadComments === 1 ? "1 new comment" : `${noteBadge.unreadComments} new comments`
	if (noteBadge.unreadEdits === 0) {
		return comments
	}
	return noteBadge.unreadComments === 0 ? "edited" : `edited, ${comments}`
}

// the two numbers of every note in the set, summed
function toNoteCount(noteBadges: NoteBadge[]): number {
	return noteBadges.reduce((total, noteBadge) => total + noteBadge.unreadEdits + noteBadge.unreadComments, 0)
}

// the note bullets: each note, the page holding it, and what changed
function toNoteLines(noteBadges: NoteBadge[]): TooltipLine[] {
	return noteBadges.map((noteBadge) => ({
		key: noteBadge.noteId,
		line: (
			<>
				<TooltipLabel>{noteBadge.noteName}</TooltipLabel>
				{" in "}
				<TooltipLabel>{noteBadge.pageName}</TooltipLabel>
				{`: ${toNoteChangeLabel(noteBadge)}`}
			</>
		),
	}))
}

/**
 * Labels a topic invitation noteBadge.
 */
export function toTopicInviteLabel(inviteCount: number): string {
	return inviteCount === 1 ? "1 topic invitation" : `${inviteCount} topic invitations`
}

/**
 * Lists the topic invitations as tooltip bullets, who invited the user to subscribe to what.
 */
export function toTopicInviteLines(topicInviteBadges: TopicInviteBadge[]): TooltipLine[] {
	return topicInviteBadges.map((topicInviteBadge) => ({
		key: topicInviteBadge.inviteId,
		line: (
			<>
				<TooltipLabel>{topicInviteBadge.inviterUsername}</TooltipLabel>
				{" invited you to subscribe to "}
				<TooltipLabel>{topicInviteBadge.topicName}</TooltipLabel>
			</>
		),
	}))
}

/**
 * Labels a summed noteBadge with each waiting group's own label, in the order the tooltip lists them.
 */
export function toUpdateLabel(
	chatMentionBadges: ChatMention[],
	noteBadges: NoteBadge[],
	inviteBadges: TopicInviteBadge[],
): string {
	const labels = [
		chatMentionBadges.length > 0 && toChatLabel(chatMentionBadges),
		noteBadges.length > 0 && toNoteLabel(toNoteCount(noteBadges)),
		inviteBadges.length > 0 && toTopicInviteLabel(inviteBadges.length),
	]
	return labels.filter(Boolean).join(", ")
}

/**
 * Shows one noteBadge summing chat mentions, note changes, and topic invitations, its tooltip listing each group under
 * its own heading, as a link when given an href and as nothing while none waits.
 */
export function UpdateCountBadge({
	chatMentions = [],
	noteBadges = [],
	invites = [],
	href,
	onClick,
	onMouseEnter,
	className,
	countBadgeClassName,
}: {
	chatMentions?: ChatMention[]
	noteBadges?: NoteBadge[]
	invites?: TopicInviteBadge[]
	// where the noteBadge's click goes, and what else it does
	href?: string
	onClick?: (event: React.MouseEvent) => void
	onMouseEnter?: () => void
	// the trigger's placement, and the count's size
	className?: string
	countBadgeClassName?: string
}) {
	const unreadCount = chatMentions.length + toNoteCount(noteBadges) + invites.length
	if (unreadCount === 0) {
		return null
	}

	// the trigger is a link when the noteBadge goes somewhere, else a status
	const unreadLabel = toUpdateLabel(chatMentions, noteBadges, invites)
	const countBadge = <CountBadge count={unreadCount} className={countBadgeClassName} />
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{href ? (
					<AnchorLink
						href={href}
						aria-label={unreadLabel}
						onClick={onClick}
						onMouseEnter={onMouseEnter}
						className={className}
					>
						{countBadge}
					</AnchorLink>
				) : (
					<span role="status" aria-label={unreadLabel} className={className}>
						{countBadge}
					</span>
				)}
			</TooltipTrigger>
			<TooltipContent className="grid gap-2">
				{chatMentions.length > 0 && (
					<TooltipSection heading={toChatLabel(chatMentions)} tooltipLines={toChatMentionLines(chatMentions)} />
				)}
				{noteBadges.length > 0 && (
					<TooltipSection heading={toNoteLabel(toNoteCount(noteBadges))} tooltipLines={toNoteLines(noteBadges)} />
				)}
				{invites.length > 0 && (
					<TooltipSection heading={toTopicInviteLabel(invites.length)} tooltipLines={toTopicInviteLines(invites)} />
				)}
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * Shows one page's unread chat mentions and note changes as one noteBadge at its name's top-right corner, its click
 * opening the chat while a chat mention waits, else the notes' page.
 */
export function PageUpdateCountBadge({
	topicId,
	teamId,
	href,
	onClick,
	onMouseEnter,
	className,
}: {
	// the chat room's topic, or null for a team's own chat room
	topicId: string | null
	// the team, for a noteBadge that stands for a team's own chat room instead of a topic's
	teamId?: string
	// where the noteBadge's click goes instead of the topic's chat room
	href?: string
	// a page title's noteBadge opens the chat here instead of following the link
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

	// a waiting chat mention sends the click to the chat, else it goes to the notes' page
	const hasChatMention = unreadMentions.length > 0
	const chatHref = href ?? `/topics/${topicId}?chat=${unreadMentions[0]?.teamId}`
	return (
		<UpdateCountBadge
			chatMentions={unreadMentions}
			noteBadges={noteBadges}
			href={hasChatMention ? chatHref : (href ?? (topicId ? `/topics/${topicId}` : `/teams/${teamId}`))}
			onClick={hasChatMention ? onClick : undefined}
			onMouseEnter={onMouseEnter}
			className={cn("absolute -top-2 -right-3.5 z-10", className)}
		/>
	)
}
