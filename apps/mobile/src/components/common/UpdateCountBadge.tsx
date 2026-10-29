import {
	type UserMenuBadgeLabel,
	usePageUpdateBadges,
	useUserMenuUpdateBadges,
} from "@carlnotes/core/hooks/useUpdateCounts"
import {
	toListedLines,
	toUpdateAccessibleLabel,
	toUpdateCount,
	toUpdateSections,
	type UpdateBadges,
	type UpdateSection,
} from "@carlnotes/core/lib/updateCounts"
import { cn } from "@carlnotes/nightshift/classNames"
import { type Href, router } from "expo-router"
import { type ComponentRef, type RefObject, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { toChatRoomHref } from "@/components/chat/chatNavigation"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CountBadge } from "./CountBadge"
import { Sheet } from "./Sheet"

/**
 * Shows one badge summing chat mentions, note changes, and topic invitations, as nothing while none waits. A press
 * follows the badge's destination, and a long press lists each group under its own heading, the web tooltip's
 * native replacement. A decorative badge sits inside a control that reads its count itself.
 */
export function UpdateCountBadge({
	chatMentions = [],
	noteBadges = [],
	invites = [],
	href,
	isDecorative = false,
	className,
	countBadgeClassName,
}: Partial<UpdateBadges> & {
	// where the badge's press goes, or nothing for a badge inside a control that reads its count itself
	href?: Href
	isDecorative?: boolean
	// the badge's placement, and the count's size
	className?: string
	countBadgeClassName?: string
}) {
	// the updates sheet's open state and the badge it returns focus to, and the summed count
	const [isUpdatesSheetOpen, setIsUpdatesSheetOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const updateBadges = { chatMentions, noteBadges, invites }
	const unreadCount = toUpdateCount(updateBadges)
	if (unreadCount === 0) {
		return null
	}
	if (isDecorative) {
		return (
			<View className={className} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
				<CountBadge count={unreadCount} className={countBadgeClassName} />
			</View>
		)
	}

	// a press follows the destination, or opens the sheet if the badge goes nowhere
	const openUpdatesSheet = (): void => setIsUpdatesSheetOpen(true)
	const handlePress = (): void => {
		if (href) {
			router.push(href)
		} else {
			openUpdatesSheet()
		}
	}
	return (
		<>
			<Pressable
				ref={triggerRef}
				accessibilityRole="button"
				accessibilityLabel={`${unreadCount}${toUpdateAccessibleLabel(updateBadges)}`}
				accessibilityHint="Long press to see what is waiting"
				hitSlop={toTouchTargetHitSlop(24)}
				className={cn("min-h-6 min-w-6 items-center justify-center", className)}
				onPress={handlePress}
				onLongPress={openUpdatesSheet}
			>
				<CountBadge count={unreadCount} className={countBadgeClassName} />
			</Pressable>
			{isUpdatesSheetOpen ? (
				<UpdatesSheet
					sections={toUpdateSections(updateBadges)}
					triggerRef={triggerRef}
					onClose={() => setIsUpdatesSheetOpen(false)}
				/>
			) : null}
		</>
	)
}

/**
 * Shows a user menu row's badge beside the title of the page that row opens, reading the stores in this leaf alone.
 */
export function UserMenuUpdateCountBadge({ label, className }: { label: UserMenuBadgeLabel; className?: string }) {
	return <UpdateCountBadge {...useUserMenuUpdateBadges()[label]} className={className} />
}

/**
 * Shows one page's unread chat mentions and note changes as one badge beside its name, its press opening the chat
 * room if a chat mention waits, else the page.
 */
export function PageUpdateCountBadge({
	topicId,
	teamId,
	href,
	className,
}: {
	// the chat room's topic, or null for a team's own chat room
	topicId: string | null
	// the team, for a team's own chat room instead of a topic's
	teamId?: string
	// where the badge's press goes instead of the page
	href?: Href
	className?: string
}) {
	// the page's waiting groups, already minus the chat rooms and notes opened this session
	const { chatMentions, noteBadges, hasChatMention, chatTeamId } = usePageUpdateBadges(topicId, teamId)

	// a waiting chat mention sends the press to its chat room, else it goes to the page
	const pageHref: Href = href ?? (topicId ? `/topics/${topicId}` : `/teams/${teamId}`)
	return (
		<UpdateCountBadge
			chatMentions={chatMentions}
			noteBadges={noteBadges}
			href={hasChatMention ? toChatRoomHref({ topicId, teamId, chatTeamId }) : pageHref}
			className={className}
		/>
	)
}

// the web tooltip's groups as a sheet: each heading over its first listed lines, the rest counted, names bold
function UpdatesSheet({
	sections,
	triggerRef,
	onClose,
}: {
	sections: UpdateSection[]
	triggerRef: RefObject<ComponentRef<typeof View> | null>
	onClose: () => void
}) {
	return (
		<Sheet title="Updates" triggerRef={triggerRef} onClose={onClose}>
			<View className="gap-3 px-2 pb-2">
				{sections.map((section) => (
					<UpdatesSheetSection key={section.heading} section={section} />
				))}
			</View>
		</Sheet>
	)
}

// one group of the sheet: its heading, its first listed lines, and the count of the rest
function UpdatesSheetSection({ section }: { section: UpdateSection }) {
	const { listedLines, moreLinesLabel } = toListedLines(section.lines)
	return (
		<View className="gap-1">
			<Text className="font-semibold">{section.heading}</Text>
			{listedLines.map((line) => (
				<Text key={line.key} className="text-sm">
					{"• "}
					{line.parts.map((part) =>
						part.isLabel ? (
							<Text key={part.key} className="text-sm font-semibold">
								{part.text}
							</Text>
						) : (
							part.text
						),
					)}
				</Text>
			))}
			{moreLinesLabel ? <Text className="text-sm">{moreLinesLabel}</Text> : null}
		</View>
	)
}
