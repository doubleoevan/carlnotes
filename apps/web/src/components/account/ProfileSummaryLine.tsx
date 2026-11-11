import {
	type ProfileSummaryLineElements,
	type ProfileSummaryLineProps,
	ProfileSummaryLine as SharedProfileSummaryLine,
} from "@carlnotes/core/components/ProfileSummaryLine"
import { USER_BLOCKS_SECTION } from "@carlnotes/core/lib/userBlocks"
import { Ban } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DetailsLine } from "@/components/common/DetailsLine"

// the web's elements: the details line under the heading, and the link that ends it
const PROFILE_SUMMARY_LINE_ELEMENTS: ProfileSummaryLineElements = {
	DetailsLine: (props) => <DetailsLine className="mt-2" {...props} />,
	UserBlockedLink: ({ label }) => (
		<AnchorLink
			href={`/account#${USER_BLOCKS_SECTION}`}
			className="text-link inline-flex items-center gap-1 hover:underline"
		>
			<Ban className="size-3.5" aria-hidden />
			{label}
		</AnchorLink>
	),
}

/**
 * The line under a profile's name on the web.
 */
export function ProfileSummaryLine(props: ProfileSummaryLineProps) {
	return <SharedProfileSummaryLine {...props} elements={PROFILE_SUMMARY_LINE_ELEMENTS} />
}
