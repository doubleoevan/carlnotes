// the fixtures the contract compatibility test sends through the registered routes in-process: for each registry key,
// the route object, the user, a request the route's current request schemas accept, and the rows the stubbed
// connection pool returns. a route whose stubbing needs object storage, a model, mail, Temporal, or more than a
// handful of rows has no fixture. only tests import it
import type { SentQuery } from "@carlnotes/db/connectionPoolStub"
import type { Hono } from "hono"
import { activityRoute } from "./activity"
import { apiRoute } from "./api"
import { appSignupGateRoute } from "./appSignupGate"
import { billingRoute } from "./billingRoute"
import { privateChatRoute } from "./chat/privateChat"
import { chatRoomRoute } from "./chat/roomRoute"
import { countsRoute } from "./counts/countsRoute"
import type { AppEnv } from "./currentUser"
import { invitesRoute } from "./invite/invites"
import { receivedInvitesRoute } from "./invite/receivedInvites"
import { noteCommentsRoute } from "./note/noteComments"
import { notesRoute } from "./note/notes"
import { TEST_NOTE_ID, TEST_NOTE_VERSION, toNoteQueryRows } from "./note/noteTestFixtures"
import { podcastEpisodesRoute } from "./podcast/podcastEpisodes"
import { podcastFeedsRoute } from "./podcast/podcastFeeds"
import { profilesRoute } from "./profiles"
import { searchRoute } from "./search/search"
import { teamsRoute } from "./team/teamsRoute"
import { termsAcceptanceRoute } from "./termsAcceptance"
import { topicAttachmentsRoute } from "./topic/attachments"
import { findingsRoute } from "./topic/findings"
import { scansRoute } from "./topic/scans"
import { subscriptionsRoute } from "./topic/subscriptions"
import { topicsRoute } from "./topic/topicsRoute"
import { userBlocksRoute } from "./userBlocks"
import { usernamesRoute } from "./usernames"
import { usersRoute } from "./users"

// one registry key's fixture: the route that serves it, the user the request is sent as or null for a visitor, the
// request's path params, query, and json body, and the rows the stubbed connection pool returns for each query sent
export type ContractFixture = {
	route: Hono<AppEnv>
	userId: string | null
	request: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown }
	toQueryRows: (sentQuery: SentQuery) => unknown[][]
}

// the column values of one table's row, by column name
type ColumnValues = Record<string, unknown>

// the signed-in user, the topic they own, the team they belong to, the podcast episode, the invitation, the note, and
// the finding the fixtures name
const USER_ID = "user-1"
const TOPIC_ID = "topic-1"
const TEAM_ID = "team-1"
const PODCAST_EPISODE_ID = "podcast-episode-1"
const INVITE_ID = "invite-1"
const NOTE_ID = "note-1"
const FINDING_ID = "finding-1"

// the time every row's timestamp holds, in the form the driver returns for a timestamp without a time zone
const ROW_TIME = "2026-07-01 00:00:00"

// the signed-in user's row, a free user, with the columns the access read and the profile select
const USER_COLUMNS: ColumnValues = {
	id: USER_ID,
	role: "user",
	plan: "free",
	budget_override_cents: null,
	username: USER_ID,
	email: "reader@example.com",
	email_verified: true,
	avatar_source: "generated",
	avatar_key: null,
	created_at: ROW_TIME,
	updated_at: ROW_TIME,
}

// the user's own public topic
const TOPIC_COLUMNS: ColumnValues = {
	id: TOPIC_ID,
	owner_id: USER_ID,
	visibility: "public",
	team_id: null,
	name: "Agents",
	prompt: "What changed in agents this week",
	frequency: "weekly",
	scheduled_time: "09:00",
	scheduled_day_of_week: "monday",
	tags: [],
	max_results: 10,
	subscriber_count: 1,
	viewer_count: 2,
	is_podcast_enabled: true,
	created_at: ROW_TIME,
	updated_at: ROW_TIME,
}

// the user's team, as the teams table and the team_members join read it, with the user as a member, and as a leader
const TEAM_COLUMNS: ColumnValues = {
	id: TEAM_ID,
	name: "Reading Club",
	is_public: true,
	description: null,
	avatar_key: null,
	role: "member",
	user_id: USER_ID,
	is_active: true,
	is_member_visible: true,
	username: USER_ID,
	plan: "free",
	created_at: ROW_TIME,
	updated_at: ROW_TIME,
}
const LEADER_COLUMNS: ColumnValues = { ...TEAM_COLUMNS, role: "leader" }

// a published podcast episode of the topic, as the episodes table joined with its topic reads it
const PODCAST_EPISODE_COLUMNS: ColumnValues = {
	...TOPIC_COLUMNS,
	id: PODCAST_EPISODE_ID,
	topic_id: TOPIC_ID,
	status: "published",
	listener_count: 3,
	season: 2026,
	number: 1,
	title: "Agents, week one",
	description: "What changed",
	cost: "0",
	is_short: false,
	duration_seconds: 60,
	audio_key: "podcast-episode-1.mp3",
	audio_byte_size: 1024,
	published_at: ROW_TIME,
}

// an invitation to the topic that names the user, with the columns its topic and sender joins read
const INVITE_COLUMNS: ColumnValues = {
	id: INVITE_ID,
	topic_id: TOPIC_ID,
	token: "invite-token",
	invited_user_id: USER_ID,
	invited_by_user_id: "user-2",
	max_uses: 1,
	used_count: 0,
	invited_at: ROW_TIME,
	name: "Agents",
	username: "vienna",
	visibility: "public",
}

// a public note the user owns on the topic, as the notes table joined with its owner reads it
const NOTE_COLUMNS: ColumnValues = {
	id: NOTE_ID,
	topic_id: TOPIC_ID,
	team_id: null,
	name: "Beans",
	visibility: "public",
	owner_user_id: USER_ID,
	html: "",
	version: 1,
	username: USER_ID,
	created_at: ROW_TIME,
	updated_at: ROW_TIME,
}

// a finding on the user's private topic, as the permission join of the finding, its topic, and its scan reads it
const FINDING_COLUMNS: ColumnValues = {
	id: TOPIC_ID,
	topic_id: TOPIC_ID,
	owner_id: USER_ID,
	visibility: "private",
	team_id: null,
	started_at: ROW_TIME,
}

// one comment on the shared test note, in the thread read's column order: the comment, then its author
const NOTE_COMMENT_ROW = ["comment-1", "hello", ROW_TIME, "user-2", "vienna", "generated", null]

// the rows the topic, the team, the finding, the podcast episode, and the topic chat room routes read
const TOPIC_TABLES = { topics: TOPIC_COLUMNS, users: USER_COLUMNS }
const TEAM_TABLES = { teams: TEAM_COLUMNS, team_members: TEAM_COLUMNS, users: USER_COLUMNS }
const LEADER_TABLES = { teams: LEADER_COLUMNS, team_members: LEADER_COLUMNS, users: USER_COLUMNS }
const FINDING_TABLES = { findings: FINDING_COLUMNS, users: USER_COLUMNS }
const PODCAST_EPISODE_TABLES = { ...TOPIC_TABLES, episodes: PODCAST_EPISODE_COLUMNS }
const TOPIC_ROOM_TABLES = { ...TEAM_TABLES, topics: TOPIC_COLUMNS, team_topics: { team_id: TEAM_ID } }

// the params that name the topic, the team, the topic's chat room on the team, the podcast episode, the invitation,
// the note, and the finding
const TOPIC_PARAMS = { id: TOPIC_ID }
const TEAM_PARAMS = { id: TEAM_ID }
const TOPIC_ROOM_PARAMS = { id: TOPIC_ID, teamId: TEAM_ID }
const PODCAST_EPISODE_PARAMS = { id: PODCAST_EPISODE_ID }
const INVITE_PARAMS = { id: INVITE_ID }
const NOTE_PARAMS = { id: NOTE_ID }
const SHARED_NOTE_PARAMS = { id: TEST_NOTE_ID }
const FINDING_PARAMS = { id: FINDING_ID }

/**
 * Returns one row for a select, or for a write that returns rows, from the table the query names: each selected
 * column's value from that table's column values by the column's own name, null for a column not given, and "0" for a
 * count or a sum not given. A table not given returns no rows, and a write without returning returns one row.
 */
export function toColumnRows(sentQuery: SentQuery, columnValuesByTable: Record<string, ColumnValues>): unknown[][] {
	// the table a select reads, or the table a write names
	const selectMatch = /^select (?:distinct on \([^)]*\) )?(.*?) from "(\w+)"/s.exec(sentQuery.text)
	const writeMatch = /^(?:insert into|update|delete from) "(\w+)"/.exec(sentQuery.text)
	const columnValues = columnValuesByTable[selectMatch?.[2] ?? writeMatch?.[1] ?? ""]
	if (!columnValues) {
		return []
	}

	// the columns the query returns. a write without returning has one affected row
	const selectList = selectMatch?.[1] ?? / returning (.*)$/s.exec(sentQuery.text)?.[1]
	if (selectList === undefined) {
		return [[1]]
	}
	return [
		splitSelectList(selectList).map((column) => {
			const columnName = toColumnName(column)
			return columnValues[columnName] ?? (/\b(?:count|sum)\(/.test(column) ? "0" : null)
		}),
	]
}

// the columns of a select list, split on the commas outside parentheses
function splitSelectList(selectList: string): string[] {
	// walk the list, keeping a comma inside a function call or a subquery
	const columns: string[] = []
	let depth = 0
	let column = ""

	// a parenthesis moves the depth, and any other character joins the column
	for (const character of selectList) {
		if (character === "(") {
			depth++
		} else if (character === ")") {
			depth--
		}
		// a top-level comma ends the column
		if (character === "," && depth === 0) {
			columns.push(column.trim())
			column = ""
		} else {
			column += character
		}
	}

	// the last column has no comma after it
	columns.push(column.trim())
	return columns
}

// a column's own name: the last quoted name in it, or the function an aggregate like count(*) calls
function toColumnName(column: string): string {
	const quotedNames = [...column.matchAll(/"(\w+)"/g)].map((match) => match[1] ?? "")
	return quotedNames.at(-1) ?? /^\w+/.exec(column)?.[0] ?? column
}

// a fixture of a route the signed-in user calls, over the column values its queries read
function toFixture(
	route: Hono<AppEnv>,
	request: ContractFixture["request"],
	columnValuesByTable: Record<string, ColumnValues>,
	userId: string | null = USER_ID,
): ContractFixture {
	return { route, userId, request, toQueryRows: (sentQuery) => toColumnRows(sentQuery, columnValuesByTable) }
}

// a fixture of a note route over the shared note test rows, with the rows given for any other query
function toNoteFixture(
	route: Hono<AppEnv>,
	request: ContractFixture["request"],
	otherRows: (sentQuery: SentQuery) => unknown[] = () => [],
): ContractFixture {
	return {
		route,
		userId: USER_ID,
		request,
		toQueryRows: (sentQuery) => toNoteQueryRows(sentQuery, otherRows) as unknown[][],
	}
}

// the fixtures, by registry key, in the registry's order
export const CONTRACT_FIXTURES: Record<string, ContractFixture> = {
	// activity
	"activityClient.fetchActivity": toFixture(activityRoute, { query: { userId: USER_ID } }, { users: USER_COLUMNS }),
	"activityClient.fetchTopicInviteBadges": toFixture(
		receivedInvitesRoute,
		{},
		{ users: USER_COLUMNS, invites: INVITE_COLUMNS },
	),
	"activityClient.sendAcceptInvite": toFixture(
		receivedInvitesRoute,
		{ params: INVITE_PARAMS },
		{ ...TOPIC_TABLES, invites: INVITE_COLUMNS },
	),
	"activityClient.sendDeclineInvite": toFixture(
		receivedInvitesRoute,
		{ params: INVITE_PARAMS },
		{ users: USER_COLUMNS, invites: INVITE_COLUMNS },
	),
	"activityClient.sendDeleteTopicInvite": toFixture(
		subscriptionsRoute,
		{ params: TOPIC_PARAMS, body: { inviteId: INVITE_ID } },
		{ ...TOPIC_TABLES, invites: INVITE_COLUMNS },
	),

	// the app sign-up gate, which a visitor calls
	"authClient.fetchAppSignupChallenge": toFixture(appSignupGateRoute, {}, {}, null),

	// billing
	"billingClient.fetchBillingState": toFixture(billingRoute, { query: { userId: USER_ID } }, { users: USER_COLUMNS }),

	// blocks
	"blockClient.fetchBlockedUsers": toFixture(
		userBlocksRoute,
		{},
		{ user_blocks: { id: "user-2", username: "vienna", created_at: ROW_TIME } },
	),
	"blockClient.sendBlockUser": toFixture(userBlocksRoute, { params: { id: "user-2" } }, { users: USER_COLUMNS }),
	"blockClient.sendUnblockUser": toFixture(userBlocksRoute, { params: { id: "user-2" } }, {}),

	// private chat
	"chatClient.fetchChatConversation": toFixture(privateChatRoute, { params: TOPIC_PARAMS }, TOPIC_TABLES),
	"chatClient.fetchChatConversation#team": toFixture(privateChatRoute, { params: TEAM_PARAMS }, TEAM_TABLES),
	"chatClient.fetchChatConversation#new-topic": toFixture(privateChatRoute, {}, { users: USER_COLUMNS }),
	"chatClient.sendClearChat": toFixture(privateChatRoute, { params: TOPIC_PARAMS }, TOPIC_TABLES),
	"chatClient.sendClearChat#team": toFixture(privateChatRoute, { params: TEAM_PARAMS }, TEAM_TABLES),
	"chatClient.sendClearChat#new-topic": toFixture(privateChatRoute, {}, {}),

	// chat rooms. the mention count, the rooms, and the topic feed are routes of the api tree itself
	"chatRoomClient.fetchChatMentionCount": toFixture(apiRoute, {}, {}),
	"chatRoomClient.fetchChatRoomMessageLinkPreviews": toFixture(
		chatRoomRoute,
		{ params: TOPIC_ROOM_PARAMS, query: { ids: "1" } },
		TOPIC_ROOM_TABLES,
	),
	"chatRoomClient.fetchChatRoomMessageLinkPreviews#team": toFixture(
		chatRoomRoute,
		{ params: TEAM_PARAMS, query: { ids: "1" } },
		TEAM_TABLES,
	),
	"chatRoomClient.fetchChatRoomMessages": toFixture(chatRoomRoute, { params: TOPIC_ROOM_PARAMS }, TOPIC_ROOM_TABLES),
	"chatRoomClient.fetchChatRoomMessages#team": toFixture(
		chatRoomRoute,
		{ params: TEAM_PARAMS, query: { before: "9" } },
		TEAM_TABLES,
	),
	"chatRoomClient.fetchChatRooms": toFixture(apiRoute, {}, { team_members: TEAM_COLUMNS, users: USER_COLUMNS }),
	"chatRoomClient.sendChatMentionsViewed": toFixture(chatRoomRoute, { params: TOPIC_ROOM_PARAMS }, TOPIC_ROOM_TABLES),
	"chatRoomClient.sendChatMentionsViewed#team": toFixture(chatRoomRoute, { params: TEAM_PARAMS }, TEAM_TABLES),
	"chatRoomClient.sendChatRoomMessage": toFixture(
		chatRoomRoute,
		{ params: TOPIC_ROOM_PARAMS, body: { content: "hello all" } },
		{ ...TOPIC_ROOM_TABLES, room_messages: { id: 7 } },
	),
	"chatRoomClient.sendChatRoomMessage#team": toFixture(
		chatRoomRoute,
		{ params: TEAM_PARAMS, body: { content: "hello all" } },
		{ ...TEAM_TABLES, room_messages: { id: 7 } },
	),
	"chatRoomClient.sendClearChatRoom": toFixture(
		chatRoomRoute,
		{ params: TOPIC_ROOM_PARAMS },
		{ ...TOPIC_ROOM_TABLES, teams: LEADER_COLUMNS, team_members: LEADER_COLUMNS },
	),
	"chatRoomClient.sendClearChatRoom#team": toFixture(chatRoomRoute, { params: TEAM_PARAMS }, LEADER_TABLES),
	"chatRoomClient.sendDeleteChatRoomMessage": toFixture(
		chatRoomRoute,
		{ params: { id: TOPIC_ID, messageId: "7" } },
		{ ...TOPIC_ROOM_TABLES, room_messages: { id: 7, author_user_id: USER_ID, team_id: TEAM_ID, topic_id: TOPIC_ID } },
	),
	"chatRoomClient.sendDeleteChatRoomMessage#team": toFixture(
		chatRoomRoute,
		{ params: { id: TEAM_ID, messageId: "7" } },
		{ ...TEAM_TABLES, room_messages: { id: 7, author_user_id: USER_ID, team_id: TEAM_ID } },
	),

	// notes. the reads of one note go through the shared note test rows
	"noteClient.createNote": toFixture(
		notesRoute,
		{ params: TOPIC_PARAMS, body: { name: "Beans", visibility: "public" } },
		{ ...TOPIC_TABLES, notes: NOTE_COLUMNS },
	),
	"noteClient.createNote#team": toFixture(
		notesRoute,
		{ params: TEAM_PARAMS, body: { name: "Beans", visibility: "team" } },
		{ ...TEAM_TABLES, notes: NOTE_COLUMNS },
	),
	"noteClient.deleteNote": toFixture(notesRoute, { params: NOTE_PARAMS }, { ...TOPIC_TABLES, notes: NOTE_COLUMNS }),
	"noteClient.deleteNoteComment": toNoteFixture(
		noteCommentsRoute,
		{ params: { id: TEST_NOTE_ID, commentId: "comment-1" } },
		(sentQuery) => (sentQuery.text.startsWith("delete") ? [["comment-1"]] : []),
	),
	"noteClient.fetchNote": toNoteFixture(notesRoute, { params: SHARED_NOTE_PARAMS }),
	"noteClient.fetchNoteBadges": toFixture(
		notesRoute,
		{},
		{
			team_members: { team_id: TEAM_ID },
			note_comments: { note_id: NOTE_ID, count: 2 },
			notes: { ...NOTE_COLUMNS, team_id: TEAM_ID, body_edited_at: ROW_TIME, last_editor_user_id: "user-2" },
			users: USER_COLUMNS,
		},
	),
	"noteClient.fetchNoteComments": toNoteFixture(noteCommentsRoute, { params: SHARED_NOTE_PARAMS }, (sentQuery) =>
		sentQuery.text.includes('from "note_comments"') ? [NOTE_COMMENT_ROW] : [],
	),
	"noteClient.fetchNotes": toFixture(notesRoute, { params: TOPIC_PARAMS }, { ...TOPIC_TABLES, notes: NOTE_COLUMNS }),
	"noteClient.fetchNotes#team": toFixture(notesRoute, { params: TEAM_PARAMS }, { ...TEAM_TABLES, notes: NOTE_COLUMNS }),
	"noteClient.postNoteComment": toNoteFixture(
		noteCommentsRoute,
		{ params: SHARED_NOTE_PARAMS, body: { body: "a thought" } },
		(sentQuery) => (sentQuery.text.startsWith("insert") ? [["comment-2", "a thought", ROW_TIME, USER_ID]] : []),
	),
	"noteClient.saveNoteBody": toNoteFixture(
		notesRoute,
		{ params: SHARED_NOTE_PARAMS, body: { html: "<p>two</p>", version: TEST_NOTE_VERSION } },
		(sentQuery) => (sentQuery.text.startsWith("update") ? [[TEST_NOTE_VERSION + 1]] : []),
	),
	"noteClient.sendNoteRead": toNoteFixture(notesRoute, { params: SHARED_NOTE_PARAMS }),
	"noteClient.updateNote": toNoteFixture(notesRoute, { params: SHARED_NOTE_PARAMS, body: { name: "Beans" } }),

	// podcast episodes
	"podcastEpisodeClient.fetchNextUnplayedPodcastEpisode": toFixture(
		podcastEpisodesRoute,
		{ query: { topicId: TOPIC_ID } },
		{ users: USER_COLUMNS },
	),
	"podcastEpisodeClient.fetchPodcastEpisode": toFixture(
		podcastEpisodesRoute,
		{ params: PODCAST_EPISODE_PARAMS },
		PODCAST_EPISODE_TABLES,
	),
	"podcastEpisodeClient.fetchPodcastEpisodePage": toFixture(
		podcastEpisodesRoute,
		{ params: { id: TOPIC_ID, season: "2026", episodeNumber: "1" } },
		PODCAST_EPISODE_TABLES,
	),
	"podcastEpisodeClient.fetchPodcastFeedUrl": toFixture(
		podcastFeedsRoute,
		{ params: TOPIC_PARAMS },
		{ ...TOPIC_TABLES, episode_feed_tokens: { token: "feed-token" } },
	),
	"podcastEpisodeClient.fetchSeasonPodcastEpisodes": toFixture(
		podcastEpisodesRoute,
		{ params: TOPIC_PARAMS, query: { season: "2026" } },
		PODCAST_EPISODE_TABLES,
	),
	"podcastEpisodeClient.sendPodcastEpisodeChapterRating": toFixture(
		podcastEpisodesRoute,
		{ params: { id: PODCAST_EPISODE_ID, position: "0" }, body: { rating: "up" } },
		{ ...PODCAST_EPISODE_TABLES, episode_chapters: { id: "chapter-1" } },
	),
	"podcastEpisodeClient.sendPodcastEpisodeListen": toFixture(
		podcastEpisodesRoute,
		{ params: PODCAST_EPISODE_PARAMS, body: { progressSeconds: 10 } },
		PODCAST_EPISODE_TABLES,
	),
	"podcastEpisodeClient.sendResetPodcastFeed": toFixture(
		podcastFeedsRoute,
		{ params: TOPIC_PARAMS },
		{
			...TOPIC_TABLES,
			topics: { ...TOPIC_COLUMNS, visibility: "private" },
			episode_feed_tokens: { token: "feed-token" },
		},
	),
	"podcastEpisodeClient.sendTopicPodcast": toFixture(
		podcastEpisodesRoute,
		{ params: TOPIC_PARAMS, body: { isPodcastEnabled: true } },
		TOPIC_TABLES,
	),

	// profiles and the account
	"profileClient.fetchProfile": toFixture(profilesRoute, { params: { userId: USER_ID } }, { users: USER_COLUMNS }),
	"profileClient.fetchProfileTeamStatuses": toFixture(
		profilesRoute,
		{ params: { userId: "user-2" } },
		{ team_members: TEAM_COLUMNS },
	),
	"profileClient.sendInviteAccess": toFixture(
		usersRoute,
		{ body: { inviteAccess: "anyone" } },
		{ users: USER_COLUMNS },
	),
	"profileClient.sendUsername": toFixture(usernamesRoute, { body: { username: "Warm-Bean" } }, { users: USER_COLUMNS }),

	// search
	"searchClient.searchSite": toFixture(searchRoute, { query: { q: "agents" } }, { users: USER_COLUMNS }),

	// teams
	"teamClient.fetchTeamNameTaken": toFixture(teamsRoute, { query: { name: "Reading Club" } }, {}),
	"teamClient.fetchTeamPage": toFixture(teamsRoute, { params: TEAM_PARAMS }, TEAM_TABLES),
	"teamClient.fetchTeams": toFixture(teamsRoute, {}, { team_members: TEAM_COLUMNS, users: USER_COLUMNS }),
	"teamClient.sendAddTopicTeam": toFixture(
		teamsRoute,
		{ params: TEAM_PARAMS, body: { topicId: TOPIC_ID } },
		{ ...LEADER_TABLES, topics: TOPIC_COLUMNS },
	),
	"teamClient.sendApproveJoinRequest": toFixture(
		teamsRoute,
		{ params: { id: TEAM_ID, userId: "user-2" } },
		LEADER_TABLES,
	),
	"teamClient.sendCreateTeam": toFixture(
		teamsRoute,
		{ body: { name: "Reading Club", topicIds: [] } },
		{ users: USER_COLUMNS },
	),
	"teamClient.sendCreateTeamInvite": toFixture(
		invitesRoute,
		{ params: TEAM_PARAMS, body: { source: "copy-link" } },
		{ ...LEADER_TABLES, invites: INVITE_COLUMNS },
	),
	"teamClient.sendDeleteJoinRequest": toFixture(teamsRoute, { params: TEAM_PARAMS }, {}),
	"teamClient.sendDeleteTeam": toFixture(teamsRoute, { params: TEAM_PARAMS }, LEADER_TABLES),
	"teamClient.sendDeleteTeamInvite": toFixture(
		teamsRoute,
		{ params: { id: TEAM_ID, inviteId: INVITE_ID } },
		{ ...LEADER_TABLES, invites: INVITE_COLUMNS },
	),
	"teamClient.sendJoinRequest": toFixture(
		teamsRoute,
		{ params: TEAM_PARAMS },
		{ teams: TEAM_COLUMNS, users: USER_COLUMNS },
	),
	"teamClient.sendRemoveTopicFromTeam": toFixture(
		teamsRoute,
		{ params: { id: TEAM_ID, topicId: TOPIC_ID } },
		{ ...LEADER_TABLES, topics: TOPIC_COLUMNS },
	),
	"teamClient.sendTeamMemberRole": toFixture(
		teamsRoute,
		{ params: { id: TEAM_ID, userId: "user-2" }, body: { role: "leader" } },
		LEADER_TABLES,
	),
	"teamClient.sendUpdateTeam": toFixture(
		teamsRoute,
		{ params: TEAM_PARAMS, body: { name: "Reading Club" } },
		LEADER_TABLES,
	),
	"teamClient.setTeamMemberVisibility": toFixture(
		teamsRoute,
		{ params: { id: TEAM_ID, userId: USER_ID }, body: { isMemberVisible: false } },
		TEAM_TABLES,
	),

	// the Terms
	"termsClient.sendTermsAcceptance": toFixture(termsAcceptanceRoute, {}, { users: USER_COLUMNS }),

	// topics
	"topicClient.fetchAddableTopics": toFixture(
		topicsRoute,
		{ query: { excludeTeam: TEAM_ID } },
		{ topics: TOPIC_COLUMNS },
	),
	"topicClient.fetchScanNote": toFixture(
		scansRoute,
		{ params: { id: "scan-1" } },
		{ scans: { ...TOPIC_COLUMNS, scan_summary: "Found a few things.", source_results: [] }, users: USER_COLUMNS },
	),
	"topicClient.fetchTopicFeed": toFixture(apiRoute, { query: { all: "true" } }, { users: USER_COLUMNS }),
	"topicClient.fetchTopicPage": toFixture(topicsRoute, { params: TOPIC_PARAMS, query: { poll: "1" } }, TOPIC_TABLES),
	"topicClient.sendAcceptInvite": toFixture(
		invitesRoute,
		{ params: { token: "invite-token" } },
		{ ...TOPIC_TABLES, invites: INVITE_COLUMNS },
	),
	"topicClient.sendAttachmentContext": toFixture(
		topicAttachmentsRoute,
		{ params: { id: "attachment-1" }, body: { context: "the slides from the talk" } },
		{ ...TOPIC_TABLES, attachments: { ...TOPIC_COLUMNS, id: "attachment-1", topic_id: TOPIC_ID, status: "ready" } },
	),
	"topicClient.sendDeleteSubscription": toFixture(subscriptionsRoute, { params: TOPIC_PARAMS }, {}),
	"topicClient.sendSubscriptionEmail": toFixture(
		subscriptionsRoute,
		{ params: TOPIC_PARAMS, body: { isEmailEnabled: true } },
		{ ...TOPIC_TABLES, subscriptions: { id: "subscription-1" } },
	),
	"topicClient.sendTopicSubscription": toFixture(
		subscriptionsRoute,
		{ params: TOPIC_PARAMS, body: { isSubscribed: true } },
		{ ...TOPIC_TABLES, topics: { ...TOPIC_COLUMNS, owner_id: "user-2" } },
	),

	// topic findings
	"topicFindingClient.sendFindingFeedback": toFixture(
		findingsRoute,
		{ params: FINDING_PARAMS, body: { feedback: "more like this" } },
		FINDING_TABLES,
	),
	"topicFindingClient.sendTopicFindingBookmark": toFixture(
		findingsRoute,
		{ params: FINDING_PARAMS, body: { isBookmarked: true } },
		FINDING_TABLES,
	),
	"topicFindingClient.sendTopicFindingConsumed": toFixture(
		findingsRoute,
		{ params: FINDING_PARAMS, body: { isConsumed: true } },
		FINDING_TABLES,
	),
	"topicFindingClient.sendTopicFindingOpened": toFixture(findingsRoute, { params: FINDING_PARAMS }, FINDING_TABLES),
	"topicFindingClient.sendTopicFindingRating": toFixture(
		findingsRoute,
		{ params: FINDING_PARAMS, body: { rating: "up" } },
		FINDING_TABLES,
	),

	// viewer counts
	"viewerCountsClient.fetchPodcastEpisodeCounts": toFixture(
		countsRoute,
		{ params: PODCAST_EPISODE_PARAMS },
		PODCAST_EPISODE_TABLES,
	),
	"viewerCountsClient.fetchTopicCounts": toFixture(countsRoute, { params: TOPIC_PARAMS }, TOPIC_TABLES),
	"viewerCountsClient.sendTopicView": toFixture(countsRoute, { params: TOPIC_PARAMS }, TOPIC_TABLES),
}
