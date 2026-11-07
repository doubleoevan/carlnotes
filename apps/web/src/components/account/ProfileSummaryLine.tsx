import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import {
	type ProfileSummaryLineElements,
	ProfileSummaryLine as SharedProfileSummaryLine,
} from "@carlnotes/core/components/ProfileSummaryLine"
import { USER_BLOCKS_SECTION } from "@carlnotes/core/lib/userBlocks"
import { Ban } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"

// the web's elements. every part of the line is centered on one row
const PROFILE_SUMMARY_LINE_ELEMENTS: ProfileSummaryLineElements = {
	Line: ({ children }) => (
		<p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1 text-sm">{children}</p>
	),
	Text: ({ children }) => <span>{children}</span>,
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
export function ProfileSummaryLine({
	profile,
}: {
	profile: Pick<ProfileResponse, "joinedAt" | "subscriberCount" | "isBlocked">
}) {
	return <SharedProfileSummaryLine profile={profile} elements={PROFILE_SUMMARY_LINE_ELEMENTS} />
}
