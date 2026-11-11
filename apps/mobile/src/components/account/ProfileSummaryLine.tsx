import {
	type ProfileSummaryLineElements,
	type ProfileSummaryLineProps,
	ProfileSummaryLine as SharedProfileSummaryLine,
} from "@carlnotes/core/components/ProfileSummaryLine"
import { USER_BLOCKS_SECTION } from "@carlnotes/core/lib/userBlocks"
import { Ban } from "lucide-react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DetailsLine } from "@/components/common/DetailsLine"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// the app's elements: the details line under the heading, and the link that ends it
const PROFILE_SUMMARY_LINE_ELEMENTS: ProfileSummaryLineElements = {
	DetailsLine,
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
export function ProfileSummaryLine(props: ProfileSummaryLineProps) {
	return <SharedProfileSummaryLine {...props} elements={PROFILE_SUMMARY_LINE_ELEMENTS} />
}
