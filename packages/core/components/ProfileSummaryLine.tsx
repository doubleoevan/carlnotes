import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType } from "react"
import { toCountDetails } from "../lib/detailsLine"
import { USER_BLOCKED_LABEL } from "../lib/userBlocks"
import type { DetailsLineProps } from "./DetailsLine"

// the platform elements of the line under a profile's name: the app's details line, and the link that ends it
export type ProfileSummaryLineElements = {
	DetailsLine: ComponentType<DetailsLineProps>
	UserBlockedLink: ComponentType<{ label: string }>
}

// when the person joined, their followers, and whether the signed-in user blocked them, with the counts the page's
// All Topics, Featured Podcasts, and All Teams sections list. the topic count is null until the topics load
export type ProfileSummaryLineProps = {
	profile: Pick<ProfileResponse, "joinedAt" | "subscriberCount" | "isBlocked">
	topicCount: number | null
	podcastEpisodeCount: number
	teamCount: number
}

/**
 * Shows when a profile's owner joined and their followers, then how many topics, podcast episodes, and teams the
 * page lists, each left out at zero, then Blocked with a link to the account page's list if the signed-in user
 * blocked them.
 */
export function ProfileSummaryLine({
	profile,
	topicCount,
	podcastEpisodeCount,
	teamCount,
	elements: { DetailsLine, UserBlockedLink },
}: ProfileSummaryLineProps & { elements: ProfileSummaryLineElements }) {
	// when the person joined and their followers, then the counts of the page's sections
	const joinDateLabel = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
	const details = [
		`Joined ${joinDateLabel}`,
		toCountLabel(profile.subscriberCount, "follower"),
		...toCountDetails([
			{ count: topicCount, noun: "topic" },
			{ count: podcastEpisodeCount, noun: "podcast episode" },
			{ count: teamCount, noun: "team" },
		]),
	]
	return (
		<DetailsLine details={details}>{profile.isBlocked && <UserBlockedLink label={USER_BLOCKED_LABEL} />}</DetailsLine>
	)
}
