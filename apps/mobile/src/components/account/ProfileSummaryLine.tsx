import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import {
	type ProfileSummaryLineElements,
	ProfileSummaryLine as SharedProfileSummaryLine,
} from "@carlnotes/core/components/ProfileSummaryLine"
import { USER_BLOCKS_SECTION } from "@carlnotes/core/lib/userBlocks"
import { Ban } from "lucide-react-native"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// the app's elements. every part of the line is centered on one row
const PROFILE_SUMMARY_LINE_ELEMENTS: ProfileSummaryLineElements = {
	Line: ({ children }) => <View className="flex-row flex-wrap items-center gap-1">{children}</View>,
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	UserBlockedLink: ({ label }) => (
		<AnchorLink
			href={`/account?section=${USER_BLOCKS_SECTION}`}
			accessibilityLabel={`${label}. Open your blocked people`}
			className="min-h-6 flex-row items-center gap-1"
			hitSlop={toTouchTargetHitSlop(24)}
		>
			<Icon as={Ban} className="size-3.5 text-link" />
			<Text className="text-sm text-link">{label}</Text>
		</AnchorLink>
	),
}

/**
 * The line under a profile's name in the app.
 */
export function ProfileSummaryLine({
	profile,
}: {
	profile: Pick<ProfileResponse, "joinedAt" | "subscriberCount" | "isBlocked">
}) {
	return <SharedProfileSummaryLine profile={profile} elements={PROFILE_SUMMARY_LINE_ELEMENTS} />
}
