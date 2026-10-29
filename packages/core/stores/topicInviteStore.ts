// the topic invitations waiting for the user's answer, as the badge poll last read them
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import { toStoreListeners } from "./storeListeners"

// what the poll last read
let topicInviteBadges: TopicInviteBadge[] = []
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Replaces the waiting invitations with what the poll last read, and publishes only a changed read.
 */
export function setTopicInviteBadges(updatedTopicInviteBadges: TopicInviteBadge[]): void {
	const isUnchanged = toInviteBadgesKey(updatedTopicInviteBadges) === toInviteBadgesKey(topicInviteBadges)
	topicInviteBadges = updatedTopicInviteBadges
	if (!isUnchanged) {
		publish()
	}
}

// the read as one string: each invitation's id, so a read that matches the last one publishes nothing
function toInviteBadgesKey(badges: TopicInviteBadge[]): string {
	return badges.map((badge) => badge.inviteId).join(",")
}

/** Reads the topic invitations waiting for the user's answer. */
export function useTopicInviteBadges(): TopicInviteBadge[] {
	useStoreVersion()
	return topicInviteBadges
}
