// the topic invitations waiting for the user's answer, as the badge poll last read them
import type { TopicInviteBadge } from "@shared/contracts"
import { useSyncExternalStore } from "react"
import { toStoreListeners } from "@/stores/storeListeners"

// what the poll last read
let topicInviteBadges: TopicInviteBadge[] = []
const { subscribe, publish, getVersion } = toStoreListeners()

/**
 * Replaces the waiting invitations with what the poll last read.
 */
export function setTopicInviteBadges(updatedTopicInviteBadges: TopicInviteBadge[]): void {
	topicInviteBadges = updatedTopicInviteBadges
	publish()
}

/** Reads the topic invitations waiting for the user's answer. */
export function useTopicInviteBadges(): TopicInviteBadge[] {
	useSyncExternalStore(subscribe, getVersion, getVersion)
	return topicInviteBadges
}
