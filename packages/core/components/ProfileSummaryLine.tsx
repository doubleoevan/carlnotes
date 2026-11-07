import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { ComponentType, ReactNode } from "react"
import { toCountLabel } from "../lib/labels"
import { USER_BLOCKED_LABEL } from "../lib/userBlocks"

// the platform elements of the line under a profile's name
export type ProfileSummaryLineElements = {
	Line: ComponentType<{ children: ReactNode }>
	Text: ComponentType<{ children: string }>
	UserBlockedLink: ComponentType<{ label: string }>
}

type ProfileSummaryLineProps = {
	profile: Pick<ProfileResponse, "joinedAt" | "subscriberCount" | "isBlocked">
	elements: ProfileSummaryLineElements
}

/**
 * Shows when a profile's owner joined and their followers, then Blocked with a link to the account page's list if the
 * signed-in user blocked them.
 */
export function ProfileSummaryLine({ profile, elements }: ProfileSummaryLineProps) {
	const { Line, Text, UserBlockedLink } = elements
	const joinDateLabel = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
	return (
		<Line>
			<Text>{`Joined ${joinDateLabel} · ${toCountLabel(profile.subscriberCount, "follower")}`}</Text>
			{profile.isBlocked && (
				<>
					<Text>·</Text>
					<UserBlockedLink label={USER_BLOCKED_LABEL} />
				</>
			)}
		</Line>
	)
}
