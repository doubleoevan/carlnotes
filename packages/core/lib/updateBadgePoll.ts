// the update badge poll: the chat mention count, the topic invitations waiting for an answer, and an admin's open report
// count, read every 45 seconds while the app is active, each source one request at a time, and a change in the mention
// count reloading the rooms
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import { startActivePoll } from "./activePoll"

const UPDATE_BADGE_POLL_MS = 45_000

export type StartUpdateBadgePollOptions = {
	// whether the app is active, how to subscribe to that change, and the account guard
	isActive: () => boolean
	subscribe: (listener: () => void) => () => void
	isCurrentAccount: () => boolean
	// the three reads, and what each read feeds. only an admin reads the open reports
	fetchChatMentionCount: () => Promise<number>
	fetchTopicInviteBadges: () => Promise<TopicInviteBadge[]>
	fetchOpenReportCount?: () => Promise<number>
	onChatMentionCountChange: () => void
	onTopicInviteBadges: (topicInviteBadges: TopicInviteBadge[]) => void
	onOpenReportCount?: (openReportCount: number) => void
	// the wait between reads, 45 seconds outside a test
	pollMs?: number
}

/**
 * Polls the badge sources while the app is active, dropping a response from a replaced account, and returns the stop.
 */
export function startUpdateBadgePoll({
	isActive,
	subscribe,
	isCurrentAccount,
	fetchChatMentionCount,
	fetchTopicInviteBadges,
	fetchOpenReportCount,
	onChatMentionCountChange,
	onTopicInviteBadges,
	onOpenReportCount,
	pollMs = UPDATE_BADGE_POLL_MS,
}: StartUpdateBadgePollOptions): () => void {
	// a poll that is stopped drops the response it was waiting for
	let isPolling = true
	const isPollCurrent = (): boolean => isPolling && isCurrentAccount()

	// report a changed mention count, the first read included
	let previousChatMentionCount = -1
	const readChatMentionCount = async (): Promise<void> => {
		const chatMentionCount = await fetchChatMentionCount()
		if (isPollCurrent() && chatMentionCount !== previousChatMentionCount) {
			previousChatMentionCount = chatMentionCount
			onChatMentionCountChange()
		}
	}

	// replace the waiting invitations with the latest read
	const readTopicInviteBadges = async (): Promise<void> => {
		const topicInviteBadges = await fetchTopicInviteBadges()
		if (isPollCurrent()) {
			onTopicInviteBadges(topicInviteBadges)
		}
	}

	// replace the open report count with the latest read
	const readOpenReportCount = async (): Promise<void> => {
		const openReportCount = await fetchOpenReportCount?.()
		if (isPollCurrent() && openReportCount !== undefined) {
			onOpenReportCount?.(openReportCount)
		}
	}

	// one poll reads every source each tick, and a failed read of one never stops the others
	const stopPoll = startActivePoll({
		isActive,
		subscribe,
		toPollMs: () => pollMs,
		isReloadingAtStart: true,
		reload: async () => {
			await Promise.allSettled([readChatMentionCount(), readTopicInviteBadges(), readOpenReportCount()])
		},
	})

	// the stop ends the poll and drops the responses it was waiting for
	return () => {
		isPolling = false
		stopPoll()
	}
}
