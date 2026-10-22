// the invented updates waiting for the signed-in user, which the header's avatar and menus badge, and the seed that
// fills the badge stores for any story
import type { ChatRoom } from "@carlnotes/contracts/chat"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import type { NoteBadge } from "@carlnotes/contracts/notes"
import { setChatRooms } from "@carlnotes/core/stores/chatRoomStore"
import { setNoteBadges } from "@carlnotes/core/stores/noteBadgeStore"
import { setTopicInviteBadges } from "@carlnotes/core/stores/topicInviteStore"
import { LLM_TOOLING_TOPIC_FIXTURE, STORY_PEOPLE } from "../fixtures"

// the people beside the user who wrote and invited
const [, CARLOS, EVAN] = STORY_PEOPLE

// a chat mention in a topic's chat room and a reply in the team's own chat room
const WAITING_CHAT_ROOMS: ChatRoom[] = [
	{
		teamId: "team-research",
		topicId: LLM_TOOLING_TOPIC_FIXTURE.id,
		name: LLM_TOOLING_TOPIC_FIXTURE.name,
		teamName: "Research Example",
		teamAvatarVersion: null,
		chatMentions: [
			{
				teamId: "team-research",
				chatMessageId: 41,
				authorUsername: CARLOS.username,
				isReply: false,
				excerpt: "@vienna the new local runtime halves load time",
			},
		],
		chatRoomMembers: [],
	},
	{
		teamId: "team-research",
		topicId: null,
		name: "Research Example",
		teamName: "Research Example",
		teamAvatarVersion: null,
		chatMentions: [
			{
				teamId: "team-research",
				chatMessageId: 42,
				authorUsername: EVAN.username,
				isReply: true,
				excerpt: "agreed, it belongs in the next podcast episode",
			},
		],
		chatRoomMembers: [],
	},
]

// a topic note edited once with two new comments
const WAITING_NOTE_BADGES: NoteBadge[] = [
	{
		noteId: "note-reading-list",
		topicId: LLM_TOOLING_TOPIC_FIXTURE.id,
		teamId: null,
		teamIds: ["team-research"],
		noteName: "Reading list",
		pageName: LLM_TOOLING_TOPIC_FIXTURE.name,
		unreadEdits: 1,
		unreadComments: 2,
	},
]

// one topic invitation waiting for an answer
const WAITING_TOPIC_INVITES: TopicInviteBadge[] = [
	{
		inviteId: "invite-edge-inference",
		topicId: "topic-edge-inference",
		topicName: "Edge inference",
		inviterUsername: CARLOS.username,
	},
]

/**
 * Seeds the badge stores with a chat mention, a reply, a note change, and a topic invitation, and returns the reset. A
 * docs page renders its inline stories in one document, so a story that calls it needs its own docs frame.
 */
export function seedWaitingUpdates(): () => void {
	return seedBadgeStores({
		chatRooms: WAITING_CHAT_ROOMS,
		noteBadges: WAITING_NOTE_BADGES,
		topicInviteBadges: WAITING_TOPIC_INVITES,
	})
}

/**
 * Seeds the chat room, note badge, and topic invitation stores for one story, each empty unless given, and returns
 * the reset that empties all three. A docs page renders its inline stories in one document, so a story that calls it
 * needs its own docs frame.
 */
export function seedBadgeStores({
	chatRooms = [],
	noteBadges = [],
	topicInviteBadges = [],
}: {
	chatRooms?: ChatRoom[]
	noteBadges?: NoteBadge[]
	topicInviteBadges?: TopicInviteBadge[]
}): () => void {
	// seed the three stores
	setChatRooms(chatRooms)
	setNoteBadges(noteBadges)
	setTopicInviteBadges(topicInviteBadges)

	// empty the stores again after the story. every story shares them
	return () => {
		setChatRooms([])
		setNoteBadges([])
		setTopicInviteBadges([])
	}
}
