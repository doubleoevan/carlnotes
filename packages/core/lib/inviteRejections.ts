// what each way an invitation can fail shows to the person holding the link, on the web page and in the app, and
// where an accepted invitation goes
import type { InviteAcceptResponse, InviteNoticeRejection } from "@carlnotes/contracts/invites"

export const INVITE_REJECTIONS: Record<InviteNoticeRejection, string> = {
	expired: "That invitation went cold.",
	exhausted: "That invitation is all poured out.",
	teamFull: "That team is full to the brim.",
	unknown: "Carl doesn't know that invitation.",
}

// what the page says while it checks, and if the check itself failed, with the retry's words as the link
export const INVITE_CHECKING_TEXT = "Carl is checking your invitation…"
export const INVITE_CHECK_FAILED_TEXT = "Carl couldn't check your invitation."
export const INVITE_CHECK_RETRY_LEAD = "Check your connection, then "
export const INVITE_CHECK_RETRY_ACTION = "try again"

// what to do after a rejection: a full team can make room, and any other rejection needs a fresh link or a topic
export const INVITE_TEAM_FULL_FOLLOW_UP = "Ask a team leader to make room, then try again."
export const INVITE_REJECTED_FOLLOW_UP_LEAD = "Ask whoever invited you for a fresh link, or "
export const INVITE_REJECTED_FOLLOW_UP_ACTION = "go find a topic"

// what the invite notice shows: the check in progress, a failed request with its retry, or the rejection
export type InviteNoticeProps = {
	isInviteAcceptFailed: boolean
	inviteRejection: InviteNoticeRejection | null
	onRetry: () => void
}

// where an accepted invitation goes: the joined topic, the joined or requested team, or the rejection to show
export type InviteDestination =
	| { kind: "topic"; topicId: string }
	| { kind: "team"; teamId: string }
	| { kind: "rejection"; rejection: InviteNoticeRejection }

/**
 * Returns where an accepted invitation goes: the topic it joined, the team it joined or asked to join, or the
 * rejection the page shows.
 */
export function toInviteDestination(inviteResponse: InviteAcceptResponse): InviteDestination {
	// the joined topic
	if (inviteResponse.status === "joined") {
		return { kind: "topic", topicId: inviteResponse.topicId }
	}

	// the joined or requested team, else the rejection
	if (inviteResponse.status === "joinedTeam" || inviteResponse.status === "requestedTeam") {
		return { kind: "team", teamId: inviteResponse.teamId }
	}
	return { kind: "rejection", rejection: inviteResponse.status }
}
