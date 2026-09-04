// zod wired contracts shared by the api and ui. the api validates with them and the ui parses with them
import { z } from "zod"
import {
	attachmentStatuses,
	avatarSources,
	type chatAttachmentKinds,
	daysOfWeek,
	editableSourceKinds,
	frequencies,
	inviteAccesses,
	maxResultsOptions,
	noteVisibilities,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	teamRoles,
	topicSectionKeys,
	visibilities,
} from "./enums"
import type { BillingInterval, Plan } from "./plans"
import { customSourceKeys } from "./sources"

// the rating mutation body. up or down sets the topic finding's rating and null clears it
export const ratingPayload = z.object({ rating: z.enum(ratings).nullable() })

// the consumed mutation body. true marks the topic finding consumed for the current user and false unmarks it
export const consumedPayload = z.object({ isConsumed: z.boolean() })

// the bookmark mutation body. true sets the topic finding bookmark for the current user and false clears it
export const bookmarkPayload = z.object({ isBookmarked: z.boolean() })

// one chat message attachment shown with a chat message
export type ChatMessageAttachment = { id: string; kind: (typeof chatAttachmentKinds)[number]; name: string }

// a chat message in a team topic's chat room, decrypted for the member viewing it
export type ChatRoomMessage = {
	id: number
	// the author's account if it still exists, and the name recorded at post-time
	authorUserId: string | null
	authorUsername: string
	// the author's current avatar, null for carl or for a departed member
	authorAvatarSource: (typeof avatarSources)[number] | null
	replyToChatMessageId: number | null
	content: string
	createdAt: string
	// the files this chat message shared with the chat room, oldest first, empty if it shared none
	attachments: ChatMessageAttachment[]
	// the cards for the chat message's first links, empty if it holds none or no link preview is stored
	linkPreviews: ChatLinkPreview[]
}

// the link preview card a link in a chat message renders as, below the chat message's own text
export type ChatLinkPreview = {
	url: string
	title: string | null
	description: string | null
	// the path this origin serves the page's image from, null if the page offered none
	imagePath: string | null
	// set when the link is a youtube video, which the card offers to play in place
	youtubeVideoId: string | null
}

// the chat room post body
export const CHAT_ROOM_MESSAGE_MAX_CHARS = 4000
export const chatRoomMessagePayload = z
	.object({
		content: z.string().trim().max(CHAT_ROOM_MESSAGE_MAX_CHARS),
		replyToChatMessageId: z.number().int().positive().nullable().optional(),
		// the shared files going with the chat message, under the per-chat message limit
		get attachments() {
			return z.array(chatAttachmentPayload).max(CHAT_MAX_ATTACHMENTS).default([])
		},
	})
	// a chat message may be attachments alone, but never nothing at all
	.refine((chatMessage) => chatMessage.content !== "" || chatMessage.attachments.length > 0)

// a user's own words about a finding to use for tuning later
export const findingFeedbackPayload = z.object({ feedback: z.string().trim().min(1).max(2000) })

// the signup-gate body. oauth never calls this endpoint, only the password path needs turnstile
export const signupGatePayload = z.object({ turnstileToken: z.string() })

// the checkout body. which paid plan and billing interval to subscribe to through Stripe Checkout
export const checkoutPayload = z.object({
	plan: z.enum(["plus", "premium"]),
	billingInterval: z.enum(["monthly", "yearly"]),
})

// the update username body. the validation rules live in toUsernameRejection
export const usernamePayload = z.object({ username: z.string() })

// how long a flag's reason can be
export const FLAG_REASON_MAX_CHARS = 1000

// the flag issue body. the subject is a topic, profile, or team id, named by which kind it is so the api can look it up
export const flagContentPayload = z.object({
	subjectKind: z.enum(["topic", "profile", "team"]),
	subjectId: z.string().min(1),
	reason: z.string().trim().min(1).max(FLAG_REASON_MAX_CHARS),
})
export type FlagContentPayload = z.infer<typeof flagContentPayload>

// the invite-delete body, named by its invite id
export const inviteDeletePayload = z.object({ inviteId: z.string() })

// one pending invite to a topic or a team, as its sender sees it
export const invite = z.object({
	id: z.string(),
	email: z.string().nullable(),
	// what an invite url includes. the ui builds the url from it against its own origin
	token: z.string(),
	maxUses: z.number(),
	usedCount: z.number(),
	expiresAt: z.string().nullable(),
})
export type Invite = z.infer<typeof invite>

// the create-team body from the shared create modal
export const createTeamPayload = z.object({
	name: z.string().trim().min(1).max(80),
	topicIds: z.array(z.string()).max(50),
	// the description the same modal writes on an edit, optional at both ends
	description: z.string().trim().max(500).nullable().optional(),
	// whether the page opens to anyone from the start. absent stays private, the default
	isPublic: z.boolean().optional(),
})
export type CreateTeamPayload = z.infer<typeof createTeamPayload>

// the leader's team edits. the public toggle's confirmation lives in the ui
export const updateTeamPayload = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	isPublic: z.boolean().optional(),
})
export type UpdateTeamPayload = z.infer<typeof updateTeamPayload>

// attaching one topic to a team, setting one member's role, and a member's own member-visibility opt-out
export const addTopicPayload = z.object({ topicId: z.string() })
export const memberRolePayload = z.object({ role: z.enum(teamRoles) })
export const memberVisibilityPayload = z.object({ isMemberVisible: z.boolean() })

// the fields every teams page row shows, shared by memberships and received invitations
export type TeamRowFields = TeamIdentity & {
	isPublic: boolean
	// the description, which the table truncates into its own column
	description: string | null
	// the active members and held topics, whose counts open the row's subtables
	memberCount: number
	topicCount: number
	// this month's spend in cents across the team's topics, split by what produced it
	scanSpendCents: number
	chatSpendCents: number
}

// one row of the teams summary: a team the user belongs to and their role
export type TeamSummary = TeamRowFields & {
	role: (typeof teamRoles)[number]
	// whether the user is the team's only active leader, whose leave toggle points at the members instead
	isOnlyLeader: boolean
	// who invited the user onto the team, for the summary's Invited by column. null joined on their own
	invitedBy: ProfileIdentity | null
	// the user's unseen mentions in the team's own chat room, newest first, counted on the name's badge
	chatMentions: ChatMention[]
}

// the team page payload
export type TeamPageResponse = {
	teamId: string
	name: string
	description: string | null
	isPublic: boolean
	// its own uploaded image, otherwise the initials and tint its name and id draw
	hasAvatar: boolean
	// what the user is to this team, which decides the leader controls and the full team
	role: (typeof teamRoles)[number] | null
	// whether the user has asked to join, which flips the join button to a withdraw
	hasRequestedToJoin: boolean
	members: {
		userId: string
		username: string
		avatarSource: (typeof avatarSources)[number] | null
		role: (typeof teamRoles)[number]
		isMemberVisible: boolean
		// false is a request to join, shown to team leaders who can activate a new member
		isActive: boolean
	}[]
	// how many members opted out of the public members list, so the team never appears smaller than it is
	hiddenMemberCount: number
	// the user's unseen chat mentions in the team's chat room, newest first, for the title badge and the pill
	chatMentions: ChatMention[]
	// the same profile-shaped rows the profile page's topic table renders
	topics: Topic[]
}

// the invite-access settings body
export const inviteAccessPayload = z.object({ inviteAccess: z.enum(inviteAccesses) })

// the user-invite body: exactly one identifier, a username or an email address
export const userInvitePayload = z
	.object({
		username: z.string().trim().min(1).optional(),
		email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
	})
	.refine((payload) => (payload.username === undefined) !== (payload.email === undefined), {
		message: "exactly one of username or email",
	})
export type UserInvitePayload = z.infer<typeof userInvitePayload>

// which control created an invite
export const inviteSources = ["compose", "copy-link", "share-sheet"] as const
export const inviteCreatePayload = z.object({ source: z.enum(inviteSources) })
export type InviteSource = (typeof inviteSources)[number]

// what creating an invite returns: the invite whose url goes into a composer or onto the clipboard
export const inviteCreateResponse = z.object({ invite })

// the ways an invite join token can fail, each one its own reason
export const inviteRejections = ["expired", "exhausted", "unknown"] as const
export type InviteRejection = (typeof inviteRejections)[number]

// what accepting an invite returns: the topic to open, or which way the token failed
export const inviteAcceptResponse = z.discriminatedUnion("status", [
	z.object({ status: z.literal("joined"), topicId: z.string(), topicName: z.string() }),
	z.object({ status: z.literal("joinedTeam"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.literal("requestedTeam"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.literal("teamFull"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.enum(inviteRejections) }),
])
export type InviteAcceptResponse = z.infer<typeof inviteAcceptResponse>

// the subscription email-preference mutation body, independent of the subscription's active state
export const subscriptionEmailPayload = z.object({
	isEmailEnabled: z.boolean(),
	// whose subscription to write, for an admin acting on somebody else's. absent means the caller's own
	subscriberUserId: z.string().optional(),
})

// one Scan row in an Activity topic's subtable
export type ActivityScan = {
	id: string
	// the outcome and, for a failed scan, the recorded reason
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	// set if the user stopped the scan, which the recap line reads
	stoppedAt: string | null
	// what the scan found, kept, and cost
	foundCount: number
	keptCount: number
	costCents: number
}

// one chat mention still waiting for the user in a chat room
export const chatMention = z.object({
	// the chat room's team, so the badge's link can open that chat room
	teamId: z.string(),
	authorUsername: z.string(),
	// whether the chat message replied to the user's own, which selects the tooltip's verb
	isReply: z.boolean(),
	// the opening of the chat message, enough to know whether to go read it
	excerpt: z.string(),
})
export type ChatMention = z.infer<typeof chatMention>

// one chat room the chat panel's menu offers: a team's own conversation, or one about a topic it has
export const chatRoom = z.object({
	teamId: z.string(),
	// null on a team's own chat room, which belongs to no topic
	topicId: z.string().nullable(),
	// the team's name, or the topic's on a topic's chat room
	name: z.string(),
	// the team the chat room belongs to, which tells two chat rooms of one topic apart
	teamName: z.string(),
	// its own uploaded image, otherwise the initials and tint its name and id draw
	teamHasAvatar: z.boolean(),
	// the user's unseen mentions in this chat room, badged on the menu row
	chatMentions: z.array(chatMention),
	// the holding team's active members, listed in the switcher row's hover tooltip
	chatRoomMembers: z.array(
		z.object({ userId: z.string(), username: z.string(), avatarSource: z.enum(avatarSources).nullable() }),
	),
})
export type ChatRoom = z.infer<typeof chatRoom>

// one note's unread counts for the signed-in user
export type NoteBadge = {
	noteId: string
	// the page the note sits on, exactly one of the two
	topicId: string | null
	teamId: string | null
	// every team the page belongs to, so a team badge counts its topics' notes as well as its own
	teamIds: string[]
	// the note's own name, and the topic or team holding it, both named in the badge's tooltip
	noteName: string
	pageName: string
	// 1 when somebody else changed the body since the user last opened it, however many edits it took
	unreadEdits: number
	// the comments written since then by somebody else, soft-deleted ones left out
	unreadComments: number
}

// one owned-Topic row on the Activity page, including its month Scans for the sub-table
export type OwnerTopic = {
	id: string
	name: string
	// who may see the topic, shown with the same icon the topic page's info card uses
	visibility: (typeof visibilities)[number]
	// the topic scan schedule: daily, weekdays, or weekly
	frequency: (typeof frequencies)[number]
	// the month-to-date figures and dates the row renders
	monthScanCount: number
	// active subscribers, counted the same way the feed and topic page count them. the owner's own row never counts
	subscriberCount: number
	createdAt: string
	updatedAt: string
	monthCostCents: number
	// how many emails the topic sent this month that resend accepted
	monthEmailCount: number
	// who owns the topic, and so whose subscription the Emails switch writes
	ownerUserId: string
	// the owner's own subscription decides whether this topic emails them
	isEmailEnabled: boolean
	scans: ActivityScan[]
	// the user's unseen chat room mentions, newest first, counted on the name's badge. empty with none
	chatMentions: ChatMention[]
}

// one row of the Activity page's subscriptions table, kept until manually deleted
export type SubscriptionRow = {
	topicId: string
	name: string
	// the byline: the owning team where one exists, otherwise the topic's owner
	owner: ProfileIdentity
	team: TeamIdentity | null
	// an invite topic only shows findings from the next scan onward
	visibility: (typeof visibilities)[number]
	subscribedAt: string
	isActive: boolean
	isEmailEnabled: boolean
	// the invite this row stands for, when the user was invited and has not answered
	inviteId: string | null
}

// an invite the user sent on a topic they own
export type InviteRow = {
	inviteId: string
	topicId: string
	name: string
	// the address the sender used, null on a username invite that renders its username instead
	inviteeEmail: string | null
	// the invitee's account when the invite resolved to one, for the avatar and profile link
	invitee: ProfileIdentity | null
	invitedAt: string
	subscribedAt: string | null
}

// the teams index: memberships and both directions of invitations
export type TeamsPageResponse = {
	teams: TeamSummary[]
	// the team invitations waiting for an answer, each naming its sender. the page links only where it opens
	receivedInvites: (TeamRowFields & {
		inviteId: string
		sender: ProfileIdentity | null
		invitedAt: string
	})[]
	// the invitations the user sent, each naming who it reached and whether they joined
	sentInvites: (TeamIdentity & {
		inviteId: string
		// the email address it was sent to, or the account for a username invite
		inviteeEmail: string | null
		invitee: ProfileIdentity | null
		invitedAt: string
		joinedAt: string | null
	})[]
}

// the user identity for a profile page link
export type ProfileIdentity = { userId: string; username: string; avatarSource: string | null }

// how a Team is shown with its name, avatar and id to link
export type TeamIdentity = {
	teamId: string
	name: string
	hasAvatar: boolean
}

// the Activity payload: whose it is, metered variable spend against the effective budget, owned topics,
export type ActivityResponse = {
	// whose activity this is: the user's own, or the user an admin is viewing
	user: ProfileIdentity
	// this month's spend in cents, split between scans and chat so that the meter can show the two apart
	scanSpendCents: number
	chatSpendCents: number
	budgetCents: number
	topics: OwnerTopic[]
	subscriptions: SubscriptionRow[]
	invites: InviteRow[]
}

// how much conversation the model holds word for word. a character budget, about twenty typical chat turns
export const CHAT_MEMORY_CHARS = 40_000

/**
 * Where the uncompacted chat turns start, walking back from the newest turn until the character budget runs out.
 */
export function toUncompactedChatTurnStart(history: { question: string; answer: string }[]): number {
	// spend the budget newest-first
	let budget = CHAT_MEMORY_CHARS
	for (let index = history.length - 1; index >= 0; index--) {
		const chatTurn = history[index]
		budget -= (chatTurn?.question.length ?? 0) + (chatTurn?.answer.length ?? 0)

		// the chat turn that overdraws the budget is the first compacted one, unless it is the newest
		if (budget < 0) {
			return Math.min(index + 1, history.length - 1)
		}
	}
	return 0
}

// how many chat turns a send posts to the llm. the older turns beyond the memory budget are compacted
export const CHAT_HISTORY_TURNS = 100

// what a broken reply stream ends with. the api client reads it as a failed chat turn
export const CHAT_STREAM_FAILED_TEXT = "\n\n[Carl's reply broke off here.]"

// how much of a compacted older answer survives
const COMPACT_ANSWER_CHARS = 280

/**
 * An older answer compacted to its opening characters, so the payload and the prompt clip identically.
 */
export function compactChatAnswer(answer: string): string {
	if (answer.length <= COMPACT_ANSWER_CHARS) {
		return answer
	}
	return `${answer.slice(0, COMPACT_ANSWER_CHARS).trimEnd()}…`
}

// how many attachments one chat turn may include, and how large each may run
export const CHAT_MAX_ATTACHMENTS = 4
export const CHAT_ATTACHMENT_TEXT_CHARS = 50_000
export const CHAT_IMAGE_DATA_CHARS = 6_000_000

// a pdf data url's limit. about 10 MB of file under base64, matching what an upload allows
export const CHAT_PDF_DATA_CHARS = 14_000_000

// a video data url's limit. about 18 MB of file under base64, inside the api's request body limit
export const CHAT_VIDEO_DATA_CHARS = 25_000_000

// how long a question may run, shared by the payload limit and the draft box. matches a chat room message
export const CHAT_QUESTION_CHARS = 4_000

// how long a history answer may run. sized past the model's own longest replies, which the history resends
export const CHAT_HISTORY_ANSWER_CHARS = 20_000

// a history question is the asked question plus its stored attachment note, so it gets room for the note
export const CHAT_HISTORY_QUESTION_CHARS = CHAT_QUESTION_CHARS + 1_000

// how long a topic prompt may grow before a copy-paste is treated as an attachment
export const TOPIC_PROMPT_CHARS = 2_000

// how many attachments one user may keep durably against one topic
export const CHAT_ATTACHMENT_KEEP_LIMIT = 20

// how many files one member may have shared with one chat room at a time
export const CHAT_ROOM_ATTACHMENT_LIMIT = 20

// the shape that every chat attachment includes whatever its kind
const chatAttachmentFields = {
	name: z.string().trim().min(1).max(200),
	keep: z.boolean().default(false),
}

// one attachment on a chat turn. each kind has its own field requirements
export const chatAttachmentPayload = z.discriminatedUnion("kind", [
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("image"),
		dataUrl: z.string().max(CHAT_IMAGE_DATA_CHARS).startsWith("data:image/"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("pdf"),
		dataUrl: z.string().max(CHAT_PDF_DATA_CHARS).startsWith("data:application/pdf"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("document"),
		dataUrl: z.string().max(CHAT_PDF_DATA_CHARS).startsWith("data:application/vnd.openxmlformats-"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("text"),
		text: z.string().max(CHAT_ATTACHMENT_TEXT_CHARS),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("video"),
		dataUrl: z.string().max(CHAT_VIDEO_DATA_CHARS).startsWith("data:video/"),
	}),
])
export type ChatAttachment = z.infer<typeof chatAttachmentPayload>

/**
 * Attachment text is held to a limit, with a marker naming the cut.
 */
export function clipAttachmentText(text: string): string {
	if (text.length <= CHAT_ATTACHMENT_TEXT_CHARS) {
		return text
	}
	const marker = `\n\n[The attachment is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${CHAT_ATTACHMENT_TEXT_CHARS.toLocaleString("en-US")} are included.]`
	return `${text.slice(0, CHAT_ATTACHMENT_TEXT_CHARS - marker.length)}${marker}`
}

/**
 * A question with its attachments named in a trailing note.
 */
export function withAttachmentNote(question: string, attachments: { name: string }[]): string {
	if (attachments.length === 0) {
		return question
	}
	const attachmentNote = `[attached: ${attachments.map((attachment) => attachment.name).join(", ")}]`
	return question === "" ? attachmentNote : `${question}\n\n${attachmentNote}`
}

// a chat turn's question plus the conversation so far
export const chatTurnPayload = z
	.object({
		question: z.string().trim().max(CHAT_QUESTION_CHARS),
		history: z
			.array(
				z.object({
					question: z.string().max(CHAT_HISTORY_QUESTION_CHARS),
					answer: z.string().max(CHAT_HISTORY_ANSWER_CHARS),
				}),
			)
			.max(CHAT_HISTORY_TURNS)
			.default([]),
		attachments: z.array(chatAttachmentPayload).max(CHAT_MAX_ATTACHMENTS).default([]),
	})
	// a chat turn may be attachments alone, but never nothing at all
	.refine((chatTurn) => chatTurn.question !== "" || chatTurn.attachments.length > 0)
export type ChatTurnPayload = z.infer<typeof chatTurnPayload>

// one persisted chat turn of a stored conversation, replayed on a later page load
export type ChatTurnRow = {
	question: string
	answer: string
	at?: string
	attachments: ChatMessageAttachment[]
	// the cards for the question's first links, empty if it holds none or no link preview is stored
	linkPreviews: ChatLinkPreview[]
	// the cards for the answer's first links, under the same rules
	answerLinkPreviews: ChatLinkPreview[]
}

// an attachment the user keeps durably for a topic
export type KeptChatAttachment = { id: string; name: string; kind: (typeof chatAttachmentKinds)[number] }

// the stored conversation for a topic
export type ChatConversation = {
	chatTurns: ChatTurnRow[]
	canChat: boolean
	isSignupRequired: boolean
	// an exhausted monthly budget keeps the panel open on the upgrade link instead of hiding chat
	isBudgetExhausted: boolean
	keptAttachments: KeptChatAttachment[]
}

// the admin role-change body. an admin cannot remove their own admin role, enforced server-side
export const setRolePayload = z.object({ role: z.enum(["admin", "user"]) })

// the admin budget-override body: a per-user monthly limit in cents, or null to fall back to the plan's backstop
export const budgetOverridePayload = z.object({ budgetOverrideCents: z.number().int().nonnegative().nullable() })

// an admin-console user row: the user's status plus their attributed storage and month-to-date variable cost
export type AdminUserRow = {
	id: string
	email: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	role: string
	plan: Plan
	createdAt: string
	// when they last signed in, null until they sign in again
	lastLoginAt: string | null
	topicCount: number
	// how many teams the user actively belongs to, opening the table row's teams subtable
	teamCount: number
	// attributed storage in bytes over globally-deduplicated Resources
	attributedBytes: number
	// month-to-date variable cost in cents. null if the proxy is unreachable
	monthVariableCostCents: number | null
	// the app's own month-to-date totals in cents, split by what produced them
	scanSpendCents: number
	chatSpendCents: number
	// the per-user override in cents (null means the plan value), and the resulting effective monthly budget
	budgetOverrideCents: number | null
	effectiveBudgetCents: number
}

// an admin-console team row: the team's status, who leads it, and month-to-date spend on its topics
export type AdminTeamRow = {
	teamId: string
	name: string
	isPublic: boolean
	createdAt: string
	// its own uploaded image, otherwise the initials and tint its name and id draw
	hasAvatar: boolean
	memberCount: number
	topicCount: number
	// month-to-date spend in cents across the team's topics, split by what produced it
	scanSpendCents: number
	chatSpendCents: number
}

// the admin-console totals: platform-wide storage and variable cost, Stripe net revenue, and the derived contribution
export type AdminTotals = {
	attributedBytes: number
	monthVariableCostCents: number
	// Stripe's reporting/balance figure that already nets refunds, proration, and fees. null if unavailable
	netRevenueCents: number | null
	// net revenue minus tracked variable cost and an optional fixed cost
	contributionCents: number | null
}

// the admin-console payload: the users and teams tables with the totals summary
export type AdminConsoleResponse = { users: AdminUserRow[]; teams: AdminTeamRow[]; totals: AdminTotals }

// one row in a profile or team page's topic table. subscriberCount is by Topic, which the footer sums
export type Topic = {
	id: string
	name: string
	// who may see the topic
	visibility: (typeof visibilities)[number]
	// when the Topic was created and last updated
	createdAt: string
	updatedAt: string
	// findings kept and resources seen, summed across every succeeded Scan the Topic has run
	keptCount: number
	seenCount: number
	subscriberCount: number
	// whether the user's own subscription emails them, null where they hold no subscription to switch
	isEmailEnabled: boolean | null
}

// a user profile search result
export type UserSearchResult = {
	userId: string
	username: string
	avatarSource: string
}

// a public team the search bar found, in the shape its avatar and link both read
export type TeamSearchResult = {
	teamId: string
	name: string
	hasAvatar: boolean
}

// how long a query must be before it can search users, and how many matches can be returned
export const USER_SEARCH_MIN_CHARS = 2
export const USER_SEARCH_LIMIT = 5

export type ProfileResponse = {
	// the avatar's tint is seeded from the user id, so the id is included with the profile
	userId: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	joinedAt: string
	// distinct people, not summed rows. the same person subscribed to multiple Topics counts once here
	subscriberCount: number
	// whether the topics below include the user's private and invite ones, which only the owner and an admin view
	includesNonPublicTopics: boolean
	topics: Topic[]
	// the teams this user belongs to. their own profile lists them all
	teams: TeamSummary[]
}

// the account page's billing state
export type BillingState = {
	plan: Plan
	// how often the subscription bills. a free user has none and reads monthly for limit lookups
	billingInterval: BillingInterval
	// the Stripe payment status (e.g. active, past_due), or null for a free user with no subscription
	status: string | null
	hasPaymentMethod: boolean
	dailyScansUsed: number
	dailyScanLimit: number
}

// a topic finding. the AI review about one Resource under a Topic, plus the user's consumed and bookmarked state
export const topicFinding = z.object({
	findingId: z.string(),
	// the topic scan that produced the finding, so the scan history can list each scan's own findings
	scanId: z.string(),
	resourceId: z.string(),
	url: z.string(),
	// the kind of the resource this finding points at, not a kind of finding
	resourceKind: z.enum(resourceKinds),
	title: z.string().nullable(),
	// shown in the metadata
	source: z.string().nullable(),
	publishedAt: z.string().nullable(),
	// when the resource was fetched, and how many times it's been opened
	fetchedAt: z.string(),
	viewCount: z.number(),
	// the model's review. the relevance score and a short explanation of why
	relevanceScore: z.number(),
	relevanceExplanation: z.string(),
	// rating belongs to the topic finding itself. isConsumed and isBookmarked are the current user's states
	rating: z.enum(ratings).nullable(),
	isConsumed: z.boolean(),
	isBookmarked: z.boolean(),
	// the teammates who bookmarked this finding, for the Bookmarked view's Team scope. empty off a team
	teamBookmarks: z
		.array(z.object({ userId: z.string(), username: z.string(), avatarSource: z.enum(avatarSources).nullable() }))
		.default([]),
	// the resource's captured engagement score, like a reddit score. null if no ingester recorded one
	engagement: z.number().nullable(),
})
export type TopicFinding = z.infer<typeof topicFinding>

// a topic feed. one Topic's header fields plus its topic finding rows
export const topicFeed = z.object({
	id: z.string(),
	name: z.string(),
	// the prompt for the topic. the design keeps it separate from the topic name
	prompt: z.string(),
	tags: z.array(z.string()),
	frequency: z.enum(frequencies),
	// the time of day that a scan runs, "HH:MM" 24-hour. scheduledDayOfWeek only matters when frequency is weekly
	scheduledTime: z.string(),
	scheduledDayOfWeek: z.enum(daysOfWeek),
	// how many findings a scan is set to keep for this topic
	maxResults: z.number(),
	// the topic owner
	owner: z.object({ userId: z.string(), username: z.string(), avatarSource: z.string() }).nullable(),
	// isTopicOwner gates attachment downloads. newCount is the user's unconsumed count for the "# new" badge
	isTopicOwner: z.boolean(),
	newCount: z.number(),
	// whether a team owns the topic
	isOnTeam: z.boolean(),
	// whether the user is an active member of any team holding the topic
	isTeamMember: z.boolean(),
	// the user's unseen chat room mentions, newest first, counted on the name's badge. empty with none
	chatMentions: z.array(chatMention),
	// the byline a team topic derives: the team itself, for anyone who can open its page. the owner otherwise
	teamLink: z
		.object({
			teamId: z.string(),
			name: z.string(),
			// its own uploaded image, otherwise the initials and tint its name and id draw
			hasAvatar: z.boolean(),
		})
		.nullable(),
	// canRate hides the rating row on a topic the user only reads
	canRate: z.boolean(),
	// whether the requesting user subscribes to this topic
	isSubscribed: z.boolean(),
	// how many subscribers the topic has, shown in the info popover
	subscriberCount: z.number(),
	// how many teams hold this topic, shown in the info popover under the follower count
	teamCount: z.number(),
	// the topic visibility, which decides which share options are live
	visibility: z.enum(visibilities),
	// schedule shown in the info popover
	createdAt: z.string(),
	lastScanAt: z.string().nullable(),
	// how long the latest succeeded scan took, in milliseconds. null until a scan has succeeded
	lastScanDurationMs: z.number().nullable(),
	// this calendar month's total scan cost in dollars, for the owner (and admins on the topic detail page). null otherwise
	monthCostDollars: z.number().nullable(),
	// an AI generated recap of the latest scan. null until a scan has succeeded
	scanSummary: z.string().nullable(),
	// the attachments and sources shown in the info popover
	attachments: z.array(
		z.object({
			id: z.string(),
			filename: z.string(),
			sourceUrl: z.string().nullable(),
			status: z.enum(attachmentStatuses),
			// the generated context that every later scan uses, for the owner and admins to edit. null for anyone else
			context: z.string().nullable(),
		}),
	),
	// topic sources with a display summary derived server side from each source's config
	sources: z.array(
		z.object({
			id: z.string(),
			sourceKind: z.enum(sourceKinds),
			summary: z.string(),
			// what the source is identified by, which is what a suggestion is deduped against
			value: z.string(),
			status: z.enum(attachmentStatuses),
			error: z.string().nullable(),
		}),
	),
	findings: z.array(topicFinding),
})
export type TopicFeed = z.infer<typeof topicFeed>

// a scan in the topic page history
export const topicScan = z.object({
	id: z.string(),
	status: z.enum(scanStatuses),
	// when the scan ran. finishedAt stays null while it is running
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	// when the user stopped the scan, null for one that ran to the end. a stopped scan is still saved as succeeded
	stoppedAt: z.string().nullable(),
	// what the scan found, kept, and filtered
	foundCount: z.number(),
	keptCount: z.number(),
	filteredCount: z.number(),
	// the scan cost in dollars. null unless the user owns the topic or holds the platform admin role
	costDollars: z.number().nullable(),
	// why the scan failed
	error: z.string().nullable(),
})

// one scan's recap, loaded per scan instead of returned with the history
export const scanNote = z.object({ scanSummary: z.string().nullable() })
export type TopicScan = z.infer<typeof topicScan>

// a topic's full payload. the topic feed shape plus everything the detail page needs
export const topicResponse = topicFeed.extend({
	visibility: z.enum(visibilities),
	// the scan history, newest first
	scans: z.array(topicScan),
	// the topic's pending invites, both the addresses it named and the links it created. empty for anyone but the owner
	invites: z.array(invite),
	// number of manual scans left today. null for topics the user does not own
	manualScansRemaining: z.number().nullable(),
	// the plan's daily scan limit, which the Brew tooltip pairs with what is left
	manualScanLimit: z.number().nullable(),
	// whether the owner has spent their monthly budget, which blocks a scan the same way a used up daily quota does
	isSpendExhausted: z.boolean(),
	// whether this user may edit or delete the topic. true for the owner and for any admin
	canEdit: z.boolean(),
	// the team owning this topic, null on a topic no team owns. the page links the team only if reachable
	team: z.object({ teamId: z.string(), name: z.string(), isPublic: z.boolean() }).nullable(),
	// whether the user already asked to join the owning team, which the Join Team button reads
	hasRequestedToJoin: z.boolean(),
	// each holding team the user belongs to, one chat room each, ordered by name
	roomTeams: z.array(z.object({ teamId: z.string(), name: z.string() })),
	// whether the owner holds more daily topics than their plan runs
	isDailyFrequencyPaused: z.boolean(),
	// this topic's position in the Featured section as well as all featured topics, both are null on the topic page
	featureOrder: z.number().nullable(),
	featuredTopics: z.array(z.object({ id: z.string(), name: z.string(), featureOrder: z.number() })).nullable(),
})
export type TopicResponse = z.infer<typeof topicResponse>

// how many Sources one topic may hold, the same on every plan.
export const MAX_TOPIC_SOURCES = 10

// a source in the update payload
export const updateTopicSource = z.union([
	z.object({ id: z.string() }),
	z.object({ sourceKind: z.enum(editableSourceKinds), config: z.record(z.string(), z.unknown()) }),
])

// the limit the worker applies to a generated attachment context
export const MAX_ATTACHMENT_CONTEXT_CHARS = 8000

// the source suggestions body
export const suggestSourcesPayload = z.object({
	name: z.string().trim(),
	prompt: z.string().trim(),
	attachmentContext: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS).default(""),
	excludeSources: z
		.array(z.object({ sourceOption: z.enum(customSourceKeys), value: z.string() }))
		.max(MAX_TOPIC_SOURCES),
	limit: z.number().int().min(1).max(MAX_TOPIC_SOURCES),
})
export type SuggestSourcesPayload = z.infer<typeof suggestSourcesPayload>

// suggested sources, each already confirmed readable. name is the display name for the source
export const suggestSourcesResponse = z.object({
	sources: z.array(
		z.object({ sourceOption: z.enum(customSourceKeys), value: z.string(), name: z.string().optional() }),
	),
})
export type SuggestSourcesResponse = z.infer<typeof suggestSourcesResponse>

// the topic update body the edit modal saves. invites and sources are lists that the api reconciles
export const updateTopicPayload = z.object({
	// the editable topic fields
	name: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	tags: z.array(z.string().trim().min(1)),
	frequency: z.enum(frequencies),
	scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
	scheduledDayOfWeek: z.enum(daysOfWeek),
	visibility: z.enum(visibilities),
	// how many findings a scan is set to keep for this topic
	maxResults: z.number().refine((value) => (maxResultsOptions as readonly number[]).includes(value)),
	// the full list of a topic's invited email addresses
	inviteEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())),
	// stored, staged, and prompt-derived Sources are combined into one array and limited to MAX_TOPIC_SOURCES
	sources: z.array(updateTopicSource).max(MAX_TOPIC_SOURCES),
})
export type UpdateTopicPayload = z.infer<typeof updateTopicPayload>

// the subscription toggle body. true subscribes the current user and false unsubscribes them
export const subscriptionPayload = z.object({ isSubscribed: z.boolean() })

// which signup button converted for posthog, kept in a cookie across the oauth round-trip
export const SIGNUP_CTA_COOKIE_NAME = "signup_cta"

// the allowed shape of a cta tag, a short slug
const CTA_TAG_PATTERN = /^[a-z0-9-]{1,40}$/

/**
 * The cta value when it is a well-formed tag, otherwise null.
 */
export function toCtaTag(value: string | null | undefined): string | null {
	return value && CTA_TAG_PATTERN.test(value) ? value : null
}

// the edited attachment context body
export const attachmentContextPayload = z.object({ context: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS) })

// the payload for attaching a page by url
export const attachmentUrlPayload = z.object({ url: z.string().trim().min(1).max(2000) })

// the admin's featured topics order choice
export const topicFeatureOrderPayload = z.object({ position: z.number().int().min(0) })

// the manual scan response which is how many manual scans the user has left today
export const manualScanResponse = z.object({ remainingScans: z.number() })

// the homepage payload. the collapsible sections of topic feeds, plus the user's topic-creation quota
export const topicFeedResponse = z.object({
	// each section pairs its key with its topic feeds
	sections: z.array(
		z.object({
			key: z.enum(topicSectionKeys),
			topics: z.array(topicFeed),
		}),
	),
	// how many topics the user can still create under their plan's topic limit
	topicsRemaining: z.number(),
	// the plan's topic limit, which the New Topic button pairs with what is left
	topicLimit: z.number(),
	// how many topics the plan can run on a daily frequency, and how many of those slots are still free
	dailyTopicLimit: z.number(),
	dailyTopicsRemaining: z.number(),
})
export type TopicFeedResponse = z.infer<typeof topicFeedResponse>

// the create-topic response which is the new topic's id
export const topicCreateResponse = z.object({ id: z.string() })

// one base64 yjs update posted from a note editor. a large paste arrives as one atomic update, so the limit is sized to hold one
export const NOTE_UPDATE_MAX_CHARS = 4 * 1024 * 1024
export const noteSyncPayload = z.object({ update: z.string().min(1).max(NOTE_UPDATE_MAX_CHARS) })

// the create body for a note on a page
export const NOTE_NAME_MAX_CHARS = 120
export const noteCreatePayload = z.object({
	name: z.string().trim().min(1).max(NOTE_NAME_MAX_CHARS),
	visibility: z.enum(noteVisibilities),
})

// the note update body. a rename takes edit access, a visibility change is the owner's alone
export const noteUpdatePayload = z.object({
	name: z.string().trim().min(1).max(NOTE_NAME_MAX_CHARS).optional(),
	visibility: z.enum(noteVisibilities).optional(),
})

// one note as the notes table lists it
export type Note = {
	id: string
	name: string
	visibility: (typeof noteVisibilities)[number]
	createdAt: string
	updatedAt: string
	canEdit: boolean
	// whether the user created it, which alone allows changing its visibility
	isTopicOwner: boolean
	// whether the user may delete it: its owner, or an admin
	canDelete: boolean
}

// the notes payload for one page
export type NotesResponse = {
	// the page's display name, substituted into the empty state
	pageName: string
	// the visibilities the user may create a note in. empty for a visitor
	creatableVisibilities: (typeof noteVisibilities)[number][]
	// the usernames a comment's "@" menu offers: the holding team's members, empty without one
	mentionableUsernames: string[]
	notes: Note[]
}

// one note opened in its dialog. the stored HTML is what a read-only open renders
export type NoteResponse = Note & { html: string }

// a comment author as the note comment ui renders it
export type NoteCommentUser = {
	id: string
	username: string
	avatarUrl: string
}
