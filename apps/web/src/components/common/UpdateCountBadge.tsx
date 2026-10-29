import { useAllUpdateBadges, usePageUpdateBadges } from "@carlnotes/core/hooks/useUpdateCounts"
import {
	toListedLines,
	toMenuTriggerLabel,
	toUpdateAccessibleLabel,
	toUpdateCount,
	toUpdateSections,
	type UpdateBadges,
	type UpdateLine,
} from "@carlnotes/core/lib/updateCounts"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { AnchorLink } from "./AnchorLink"
import { CountBadge } from "./CountBadge"

// one line of a tooltip section, keyed by the thing that it names.
// a marker, such as an avatar, shows in place of the line's bullet
export type TooltipLine = { key: string; line: React.ReactNode; marker?: React.ReactNode }

/**
 * Bolds a label in a tooltip: a user, a topic, a team, or a note.
 */
export function TooltipLabel({ children }: { children: string }) {
	return <span className="font-semibold">{children}</span>
}

/**
 * One tooltip section, with an optional heading over its lines, the first listedLineCount listed and the rest counted.
 */
export function TooltipSection({
	heading,
	tooltipLines,
	listedLineCount,
}: {
	heading?: string
	tooltipLines: TooltipLine[]
	listedLineCount?: number
}) {
	// a section whose lines have markers shows each marker in place of a bullet, and the rest are counted
	const hasMarkers = tooltipLines.some((tooltipLine) => tooltipLine.marker)
	const { listedLines, moreLinesLabel } = toListedLines(tooltipLines, listedLineCount)
	return (
		<div>
			{heading ? <p className="font-semibold">{heading}</p> : null}
			<ul className={hasMarkers ? "mt-0.5 space-y-0.5" : "list-disc pl-4"}>
				{listedLines.map(({ key, line, marker }) => (
					<li key={key} className={hasMarkers ? "flex items-center gap-1.5" : undefined}>
						{marker}
						{line}
					</li>
				))}
			</ul>
			{moreLinesLabel && <p>{moreLinesLabel}</p>}
		</div>
	)
}

/**
 * Renders a shared update line as a tooltip line, its labels bold.
 */
export function toTooltipLine(updateLine: UpdateLine): TooltipLine {
	return {
		key: updateLine.key,
		line: updateLine.parts.map((part) =>
			part.isLabel ? <TooltipLabel key={part.key}>{part.text}</TooltipLabel> : part.text,
		),
	}
}

/**
 * Shows one badge summing chat mentions, note changes, and topic invitations, its tooltip listing each group under
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
}: Partial<UpdateBadges> & {
	// where the badge's click goes, and what else it does
	href?: string
	onClick?: (event: React.MouseEvent) => void
	onMouseEnter?: () => void
	// the trigger's placement, and the count's size
	className?: string
	countBadgeClassName?: string
}) {
	const updateBadges = { chatMentions, noteBadges, invites }
	const unreadCount = toUpdateCount(updateBadges)
	if (unreadCount === 0) {
		return null
	}

	// a screen reader hears the shown count, then each waiting group's own label
	const countBadge = (
		<>
			<CountBadge count={unreadCount} className={countBadgeClassName} />
			<span className="sr-only">{toUpdateAccessibleLabel(updateBadges)}</span>
		</>
	)

	// the trigger is a link when the badge goes somewhere, else a status
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{href ? (
					<AnchorLink
						href={href}
						onClick={onClick}
						onMouseEnter={onMouseEnter}
						// the padding grows the link to the 24-pixel minimum target, and the negative margin keeps the count in place
						className={cn("-m-1 p-1", className)}
					>
						{countBadge}
					</AnchorLink>
				) : (
					<span role="status" className={className}>
						{countBadge}
					</span>
				)}
			</TooltipTrigger>
			<TooltipContent className="grid gap-2">
				{toUpdateSections(updateBadges).map((section) => (
					<TooltipSection
						key={section.heading}
						heading={section.heading}
						tooltipLines={section.lines.map(toTooltipLine)}
					/>
				))}
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * Shows a menu trigger's one badge, summing every unread chat mention, note change, and topic invitation, with the
 * trigger's accessible name: its own name, then each waiting group's label.
 */
export function MenuTriggerUpdateCountBadge({
	name,
	className,
	countBadgeClassName,
}: {
	// the trigger's own name, such as Menu
	name: string
	// the badge's placement on the trigger, and the count's size
	className?: string
	countBadgeClassName?: string
}) {
	// every unread chat mention, note change, and topic invitation
	const updateBadges = useAllUpdateBadges()
	return (
		<>
			{/* the trigger's name, read from its content. a screen reader skips the status badge inside a button */}
			<span className="sr-only">{toMenuTriggerLabel(name, updateBadges)}</span>
			<UpdateCountBadge {...updateBadges} className={className} countBadgeClassName={countBadgeClassName} />
		</>
	)
}

/**
 * Shows one page's unread chat mentions and note changes as one badge at its name's top-right corner, its click
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
	// the team, for a badge that stands for a team's own chat room instead of a topic's
	teamId?: string
	// where the badge's click goes instead of the topic's chat room
	href?: string
	// a page title's badge opens the chat here instead of following the link
	onClick?: (event: React.MouseEvent) => void
	onMouseEnter?: () => void
	className?: string
}) {
	// the page's waiting groups, already minus the chat rooms and notes opened this session
	const { chatMentions, noteBadges, hasChatMention, chatTeamId } = usePageUpdateBadges(topicId, teamId)

	// a waiting chat mention sends the click to the chat, else it goes to the notes' page
	const pageHref = href ?? (topicId ? `/topics/${topicId}` : `/teams/${teamId}`)
	const chatHref = href ?? `${pageHref}?chat=${chatTeamId}`
	return (
		<UpdateCountBadge
			chatMentions={chatMentions}
			noteBadges={noteBadges}
			href={hasChatMention ? chatHref : pageHref}
			onClick={hasChatMention ? onClick : undefined}
			onMouseEnter={onMouseEnter}
			className={cn("absolute -top-2 -right-3.5 z-10", className)}
		/>
	)
}
