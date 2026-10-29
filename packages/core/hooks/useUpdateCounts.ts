// the update counts a badge reads from the shared stores: every waiting group for a menu trigger, and one page's own

import type { UpdateBadges } from "../lib/updateCounts"
import {
	useAllChatMentions,
	useAllTeamChatMentions,
	useAllTopicChatMentions,
	useTeamMentions,
	useTopicMentions,
} from "../stores/chatRoomStore"
import { useAllNoteBadges, usePageNoteBadges } from "../stores/noteBadgeStore"
import { useTopicInviteBadges } from "../stores/topicInviteStore"

/**
 * Reads every unread chat mention, note change, and topic invitation, for a menu trigger's one badge.
 */
export function useAllUpdateBadges(): UpdateBadges {
	return { chatMentions: useAllChatMentions(), noteBadges: useAllNoteBadges(), invites: useTopicInviteBadges() }
}

// the user menu's rows that show a badge
export type UserMenuBadgeLabel = "Profile" | "Teams" | "Activity"

/**
 * Reads what each user menu row sums into its badge: the Profile row the topics' chats and notes, the Teams row the
 * teams' own, and the Activity row the topic invitations waiting for an answer.
 */
export function useUserMenuUpdateBadges(): Record<UserMenuBadgeLabel, UpdateBadges> {
	// what the last poll read, split into the topics' and the teams' own
	const topicChatMentions = useAllTopicChatMentions()
	const teamChatMentions = useAllTeamChatMentions()
	const noteBadges = useAllNoteBadges()
	const topicInviteBadges = useTopicInviteBadges()
	return {
		Profile: {
			chatMentions: topicChatMentions,
			noteBadges: noteBadges.filter((noteBadge) => noteBadge.topicId !== null),
			invites: [],
		},
		Teams: {
			chatMentions: teamChatMentions,
			noteBadges: noteBadges.filter((noteBadge) => noteBadge.teamId !== null),
			invites: [],
		},
		Activity: { chatMentions: [], noteBadges: [], invites: topicInviteBadges },
	}
}

// one page's waiting groups, and where its badge goes
export type PageUpdateBadges = UpdateBadges & {
	// the badge opens the chat if a chat mention waits, else the page
	hasChatMention: boolean
	// the team whose chat room holds the first waiting chat mention
	chatTeamId: string | undefined
}

/**
 * Reads one page's unread chat mentions and note changes: a topic's, or a team's own when topicId is null.
 */
export function usePageUpdateBadges(topicId: string | null, teamId: string | undefined): PageUpdateBadges {
	// the unread chat mentions for this page, already minus the chat rooms opened this session
	const topicMentions = useTopicMentions(topicId ?? "")
	const teamMentions = useTeamMentions(teamId ?? "")
	const chatMentions = topicId ? topicMentions : teamMentions

	// the notes waiting on the same page, already minus the ones opened this session
	const noteBadges = usePageNoteBadges(topicId, teamId)
	return {
		chatMentions,
		noteBadges,
		invites: [],
		hasChatMention: chatMentions.length > 0,
		chatTeamId: chatMentions[0]?.teamId,
	}
}
