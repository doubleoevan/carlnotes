import type { ReactionType } from "@carlnotes/contracts/social"
import type { ReactionOptionProps } from "@carlnotes/core/lib/socialElements"
import { cn } from "@carlnotes/nightshift/classNames"
import { Heart, HeartPlus, Laugh, Lightbulb, type LucideIcon, PartyPopper, ThumbsUp } from "lucide-react-native"
import { useState } from "react"
import { Pressable, View } from "react-native"
import { toActiveIconProps } from "@/activeIconProps"
import { Sheet } from "@/components/common/Sheet"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// each reaction type's icon, the web's own
const REACTION_ICONS: Record<ReactionType, LucideIcon> = {
	like: ThumbsUp,
	celebrate: PartyPopper,
	support: HeartPlus,
	love: Heart,
	insightful: Lightbulb,
	funny: Laugh,
}

// a reaction option is drawn at the web's height and reaches the touch target through its hit slop
export const ROW_CONTROL_HEIGHT = 32

// what a long press announces, and the screen reader action that does the same
const SHOW_USERS_HINT = "Long press to see who reacted"
const SHOW_USERS_ACTION = "longpress"

/**
 * One reaction type in the picker. A press saves it, and a phone has no hover, so a long press opens the web tooltip's
 * list of who chose it in a sheet.
 */
export function ReactionOption({
	reactionType,
	label,
	count,
	users,
	moreUsersLabel,
	isOwn,
	isDisabled,
	onPress,
}: ReactionOptionProps) {
	const [isShowingUsers, setIsShowingUsers] = useState(false)
	const hasUsers = users.length > 0
	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${label}${count > 0 ? `, ${count}` : ""}`}
				accessibilityHint={hasUsers ? SHOW_USERS_HINT : undefined}
				accessibilityActions={hasUsers ? [{ name: SHOW_USERS_ACTION, label: SHOW_USERS_HINT }] : undefined}
				onAccessibilityAction={() => setIsShowingUsers(true)}
				accessibilityState={{ selected: isOwn, disabled: isDisabled }}
				hitSlop={toTouchTargetHitSlop(ROW_CONTROL_HEIGHT)}
				disabled={isDisabled}
				onPress={onPress}
				onLongPress={hasUsers ? () => setIsShowingUsers(true) : undefined}
				className="h-8 flex-row items-center gap-1 rounded-full px-1 active:opacity-75"
			>
				<Icon
					as={REACTION_ICONS[reactionType]}
					{...toActiveIconProps(isOwn, "size-4 text-muted-foreground")}
					// a light fill. a solid fill hides the lines inside the Funny icon
					fillOpacity={0.35}
				/>
				{count > 0 && (
					<Text className={cn("text-xs", isOwn ? "font-semibold text-primary" : "text-muted-foreground")}>{count}</Text>
				)}
			</Pressable>
			{/* the type over each user who chose it, linking to their profile */}
			{isShowingUsers && (
				<Sheet title={label} onClose={() => setIsShowingUsers(false)}>
					<View className="gap-3">
						{users.map((user) => (
							<UserProfileLink key={user.userId} user={user} />
						))}
						{moreUsersLabel && <Text className="text-sm text-muted-foreground">{moreUsersLabel}</Text>}
					</View>
				</Sheet>
			)}
		</>
	)
}
