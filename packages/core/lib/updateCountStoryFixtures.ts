// the waiting updates both component browsers show on the update count badge: two chat mentions in a topic's chat
// room, a note on the topic and one on the team's page, one topic invitation, and more mentions than the badge counts
import type { ChatMention, ChatRoom } from "@carlnotes/contracts/chat"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import type { NoteBadge } from "@carlnotes/contracts/notes"

// the topic and the team every fixture sits on
export const UPDATE_STORY_TOPIC_ID = "topic-llm-tooling"
export const UPDATE_STORY_TEAM_ID = "team-reading-club"

// two chat mentions in the topic's chat room, one of them a reply
export const UPDATE_STORY_CHAT_MENTIONS: ChatMention[] = [
	{
		teamId: UPDATE_STORY_TEAM_ID,
		chatMessageId: 101,
		authorUsername: "carlos",
		isReply: false,
		excerpt: "@vienna have you tried the new eval runner?",
	},
	{
		teamId: UPDATE_STORY_TEAM_ID,
		chatMessageId: 102,
		authorUsername: "evan",
		isReply: true,
		excerpt: "Agreed, the tracing view saves an hour a week.",
	},
]

// one note on the topic with an edit and two comments, and one on the team's page with a comment
export const UPDATE_STORY_NOTE_BADGES: NoteBadge[] = [
	{
		noteId: "note-eval-checklist",
		topicId: UPDATE_STORY_TOPIC_ID,
		teamId: null,
		teamIds: [UPDATE_STORY_TEAM_ID],
		noteName: "Eval checklist",
		pageName: "LLM tooling",
		unreadEdits: 1,
		unreadComments: 2,
	},
	{
		noteId: "note-reading-list",
		topicId: null,
		teamId: UPDATE_STORY_TEAM_ID,
		teamIds: [UPDATE_STORY_TEAM_ID],
		noteName: "Reading list",
		pageName: "Reading Club",
		unreadEdits: 0,
		unreadComments: 1,
	},
]

// one invitation to subscribe to a topic
export const UPDATE_STORY_TOPIC_INVITES: TopicInviteBadge[] = [
	{ inviteId: "invite-rust", topicId: "topic-rust", topicName: "Rust in production", inviterUsername: "carlos" },
]

// twelve chat mentions, more than the count and the tooltip or the sheet show
export const UPDATE_STORY_MANY_CHAT_MENTIONS: ChatMention[] = Array.from({ length: 12 }, (_, index) => ({
	teamId: UPDATE_STORY_TEAM_ID,
	chatMessageId: 200 + index,
	authorUsername: index % 2 === 0 ? "carlos" : "evan",
	isReply: index % 3 === 0,
	excerpt: `Question ${index + 1} about the eval runner`,
}))

// the topic's chat room as the chat panel last read it, holding the two chat mentions and no members
export const UPDATE_STORY_TOPIC_CHAT_ROOM: ChatRoom = {
	teamId: UPDATE_STORY_TEAM_ID,
	topicId: UPDATE_STORY_TOPIC_ID,
	name: "LLM tooling",
	teamName: "Reading Club",
	teamAvatarVersion: null,
	chatMentions: UPDATE_STORY_CHAT_MENTIONS,
	chatRoomMembers: [],
}
