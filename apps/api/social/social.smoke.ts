// a live smoke test for reactions and comments against the dev database: one reaction per user per social target, the
// summary of one and many, the admin block, the mentions, the replies and their pages, the edit time, the user blocks,
// the reports, the paged thread, a user's unseen mentions and their seen marks, a thread read by a linked comment, a
// comment on a Topic Post, the editor's share with the podcast and its shared comment slots, and the deletes
// run it with: bun run smoke:social. needs Doppler secrets

import type { Comment } from "@carlnotes/contracts/social"
import type { SocialReader } from "./socialRows"

// no model call and no analytics event leaves this run
delete Bun.env.LITELLM_BASE_URL
delete Bun.env.POSTHOG_API_KEY

const { connectionPool, db } = await import("@carlnotes/db")
const { reports } = await import("@carlnotes/db/schema/reports")
const { findings, resources, scans } = await import("@carlnotes/db/schema/scans")
const { commentMentions, comments, reactions } = await import("@carlnotes/db/schema/social")
const { topicPosts } = await import("@carlnotes/db/schema/topicPosts")
const { topics } = await import("@carlnotes/db/schema/topics")
const { users } = await import("@carlnotes/db/schema/users")

// the shared texts a Scan reads, and the query helpers
const { loadSharedCommentTexts } = await import("@carlnotes/db/sharedComments")
const { and, eq, inArray, like } = await import("drizzle-orm")

// the reads and writes under test, loaded after the env is cleared
const { removeReport, saveReport, toReportTextHash } = await import("../report/reports")
const { clearUnseenCommentMentions } = await import("@carlnotes/db/unseenCommentMentions")
const { loadUnseenCommentMentions, saveSeenCommentMentions } = await import("./commentMentions")

// the thread, the reactions, the shares, and the user blocks
const { loadCommentPage, loadCommentReplyPage } = await import("./commentRows")
const { deleteComment, editComment, postComment, shareComment } = await import("./comments")
const { loadReactionSummaries, loadReactionSummary } = await import("./reactionRows")
const { saveReaction } = await import("./reactions")
const { loadSharedComments } = await import("./sharedCommentRows")
const { toSocialReader } = await import("./socialTargets")
const { deleteUserBlock, saveUserBlock } = await import("../userBlocks")

// the ids of this run's rows, which a parallel run never shares
const runId = `social-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const userIds = { owner: `${runId}-owner`, follower: `${runId}-follower`, stranger: `${runId}-stranger` }
const topicIds = { first: `${runId}-topic-1`, second: `${runId}-topic-2` }
const firstTopic = { kind: "topic", id: topicIds.first } as const
const firstTopicRow = {
	id: topicIds.first,
	ownerId: userIds.owner,
	visibility: "public" as const,
	teamId: null,
	name: "smoke topic",
}

// the properties a request would send with its events
const analyticsProperties = { entryPoint: "api", plan: "free" } as Parameters<
	typeof saveReaction
>[0]["analyticsProperties"]

// a time past the edit time, which a backdated row is created at
const pastEditTime = new Date(Date.now() - 16 * 60_000)

// a visitor's read, and a signed-in user's read who may neither moderate nor share
const visitorReader: SocialReader = { userId: null, canModerate: false, canShare: false }
const toPlainReader = (userId: string): SocialReader => ({ userId, canModerate: false, canShare: false })

// each check's result, counted for the exit code
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	console.log(`${isTestPassing ? "ok  " : "FAIL"} ${label}`, isTestPassing || detail === undefined ? "" : detail)
	failureCount += isTestPassing ? 0 : 1
}

// three users and two public topics that the owner owns
async function seed(): Promise<void> {
	await db.insert(users).values(
		Object.values(userIds).map((userId) => ({
			id: userId,
			name: userId,
			email: `${userId}@carlnotes.test`,
			username: userId,
			usernameNormalized: userId.replaceAll("-", "").toLowerCase(),
		})),
	)
	await db.insert(topics).values(
		Object.values(topicIds).map((topicId) => ({
			id: topicId,
			ownerId: userIds.owner,
			name: "smoke topic",
			visibility: "public" as const,
		})),
	)
}

// a Finding of the first topic that its Feed shows, on a Scan that succeeded
async function seedFinding(): Promise<string> {
	// the resource and the Scan the Finding hangs on
	const findingId = `${runId}-finding`
	await db.insert(resources).values({ id: findingId, url: `https://carlnotes.test/${findingId}`, kind: "read" })
	const [scan] = await db
		.insert(scans)
		.values({ topicId: topicIds.first, ownerId: userIds.owner, status: "succeeded", startedAt: new Date() })
		.returning()
	await db.insert(findings).values({
		id: findingId,
		topicId: topicIds.first,
		resourceId: findingId,
		scanId: scan?.id ?? "",
		foundScanId: scan?.id ?? "",
		relevanceScore: 0.9,
	})
	return findingId
}

// delete the run's topics, resources, and users, which takes every reaction, comment, and report with them
async function cleanUp(): Promise<void> {
	await db.delete(topics).where(inArray(topics.id, Object.values(topicIds)))
	await db.delete(resources).where(like(resources.id, `${runId}-%`))
	await db.delete(users).where(like(users.id, `${runId}-%`))
}

// a save as one user on the first topic
function save(userId: string, reactionType: "like" | "love" | null): ReturnType<typeof saveReaction> {
	return saveReaction({ userId, payload: { target: firstTopic, reactionType }, analyticsProperties })
}

// a post as one user on the first topic
function post(
	userId: string,
	body: string,
	options: { parentCommentId?: string; chapterPosition?: number } = {},
): ReturnType<typeof postComment> {
	return postComment({ userId, payload: { target: firstTopic, body, ...options }, analyticsProperties })
}

// the comment a post saved, or null if it ended otherwise
function toSavedComment(commentWriteResult: Awaited<ReturnType<typeof postComment>>): Comment | null {
	return commentWriteResult.status === "saved" ? commentWriteResult.comment : null
}

async function checkReactions(): Promise<void> {
	// two saves at once leave one row, and a new type edits the same row
	const racedResults = await Promise.all([save(userIds.follower, "like"), save(userIds.follower, "like")])
	const followerRows = (): Promise<{ id: string; reactionType: string }[]> =>
		db.select().from(reactions).where(eq(reactions.userId, userIds.follower))
	check(
		"two saves at once both end saved",
		racedResults.every((result) => result.status === "saved"),
		racedResults,
	)
	check("two saves at once leave one row", (await followerRows()).length === 1)
	const [firstRow] = await followerRows()
	await save(userIds.follower, "love")
	const [changedRow] = await followerRows()
	check(
		"a new type edits the same row",
		changedRow?.id === firstRow?.id && changedRow?.reactionType === "love",
		await followerRows(),
	)
	check("the same type again ends saved", (await save(userIds.follower, "love")).status === "saved")

	// the summary counts each type and holds the reader's own type
	await save(userIds.stranger, "love")
	await save(userIds.owner, "like")
	const followerSummary = await loadReactionSummary(userIds.follower, firstTopic)
	check(
		"the summary counts each type",
		followerSummary.counts.length === 2 &&
			followerSummary.counts.find((count) => count.reactionType === "like")?.count === 1 &&
			followerSummary.counts.find((count) => count.reactionType === "love")?.count === 2,
		followerSummary.counts,
	)
	check("the summary holds the reader's own type", followerSummary.ownReactionType === "love")
	check("a visitor has no own type", (await loadReactionSummary(null, firstTopic)).ownReactionType === null)

	// many social targets load together, and one with no reactions has no entry
	const reactionSummaries = await loadReactionSummaries({
		userId: null,
		targets: Object.values(topicIds).map((topicId) => ({ kind: "topic" as const, id: topicId })),
	})
	check(
		"a target with no reactions has no summary",
		reactionSummaries.size === 1 && reactionSummaries.has(`topic:${topicIds.first}`),
	)

	// a count names who chose the type
	const namedSummary = await loadReactionSummary(null, firstTopic)
	check(
		"a count names who chose the type",
		namedSummary.counts.every((reactionCount) => reactionCount.users.length === reactionCount.count),
		namedSummary.counts,
	)

	// an admin block removes a person from every count, and stops their saves
	await db.update(users).set({ adminBlockedAt: new Date() }).where(eq(users.id, userIds.stranger))
	const adminBlockedSummary = await loadReactionSummary(null, firstTopic)
	check(
		"an admin block leaves the person out of the counts",
		adminBlockedSummary.counts.find((count) => count.reactionType === "love")?.count === 1,
		adminBlockedSummary.counts,
	)
	check("a user under an admin block cannot save", (await save(userIds.stranger, "like")).status === "notFound")
	await db.update(users).set({ adminBlockedAt: null }).where(eq(users.id, userIds.stranger))

	// no type removes the user's own reaction, and nobody else's
	check("no type ends saved", (await save(userIds.owner, null)).status === "saved")
	const [ownerRow] = await db.select().from(reactions).where(eq(reactions.userId, userIds.owner))
	check("no type removes the user's own reaction", ownerRow === undefined)
	check("no type leaves the others", (await followerRows()).length === 1)
}

async function checkComments(): Promise<void> {
	// a post stores its mention, and an unknown name mentions nobody
	const posted = await post(userIds.follower, `hello @${userIds.owner} and @nobody-${runId}`)
	const postedComment = toSavedComment(posted)
	check("a post returns the comment with its one stored mention", postedComment?.mentions.length === 1, posted)
	check("the mention names the user", postedComment?.mentions[0]?.userId === userIds.owner)
	check("a follower's post is not shared with the podcast", postedComment?.isSharedWithPodcast === false)
	check(
		"a follower's post returns no shared comment slots",
		posted.status === "saved" && posted.sharedCommentSlots === null,
	)

	// a chapter on a topic's thread is rejected
	const chapterPost = await post(userIds.follower, "chapter", { chapterPosition: 1 })
	check("a chapter on a topic's thread is rejected", chapterPost.status === "invalidChapter")

	// a reaction to a comment counts on the comment alone
	const commentId = postedComment?.id ?? ""
	const commentTarget = { kind: "comment", id: commentId } as const
	const commentReaction = await saveReaction({
		userId: userIds.owner,
		payload: { target: commentTarget, reactionType: "funny" },
		analyticsProperties,
	})
	check(
		"a reaction to a comment ends saved with its count",
		commentReaction.status === "saved" && commentReaction.summary.counts[0]?.reactionType === "funny",
		commentReaction,
	)
	check(
		"a reaction to a comment leaves the topic's counts alone",
		(await loadReactionSummary(null, firstTopic)).counts.every((count) => count.reactionType !== "funny"),
	)

	// a comment stores the Topic that its social target belongs to
	const [storedCommentRow] = await db
		.select({ targetTopicId: comments.targetTopicId })
		.from(comments)
		.where(eq(comments.id, commentId))
	check("a comment stores its social target's Topic", storedCommentRow?.targetTopicId === topicIds.first)

	// a reaction to that comment stores the same Topic
	const [storedReactionRow] = await db
		.select({ targetTopicId: reactions.targetTopicId })
		.from(reactions)
		.where(eq(reactions.commentId, commentId))
	check("a reaction to a comment stores that comment's Topic", storedReactionRow?.targetTopicId === topicIds.first)

	// a reply joins its parent, a reply to a reply joins the same parent, and a parent on another target is missing
	const reply = toSavedComment(await post(userIds.owner, "first reply", { parentCommentId: commentId }))
	const replyToReply = toSavedComment(await post(userIds.stranger, "second reply", { parentCommentId: reply?.id }))
	check("a reply names its parent", reply?.parentCommentId === commentId, reply)
	check("a reply to a reply joins that reply's parent", replyToReply?.parentCommentId === commentId, replyToReply)
	check("an owner's reply is not shared with the podcast", reply?.isSharedWithPodcast === false)
	const crossTargetReply = await postComment({
		userId: userIds.owner,
		payload: { target: { kind: "topic", id: topicIds.second }, body: "wrong thread", parentCommentId: commentId },
		analyticsProperties,
	})
	check("a parent on another target reads as missing", crossTargetReply.status === "notFound")

	// the thread lists the comment with its reply count, its first replies oldest first, and its reactions
	const followerPage = await loadCommentPage({
		reader: toPlainReader(userIds.follower),
		target: firstTopic,
		topic: firstTopicRow,
	})
	const threadComment = followerPage.comments.find((comment) => comment.id === commentId)
	check(
		"the thread holds the top-level comment alone",
		followerPage.comments.length === 1,
		followerPage.comments.length,
	)
	check("the comment counts its replies", threadComment?.replyCount === 2, threadComment?.replyCount)
	check(
		"the first replies read oldest first",
		threadComment?.replies.map((threadReply) => threadReply.body).join() === "first reply,second reply",
		threadComment?.replies,
	)
	check(
		"the comment includes its reactions",
		threadComment?.reactions.counts[0]?.reactionType === "funny" && threadComment.reactions.ownReactionType === null,
		threadComment?.reactions,
	)
	const replyPage = await loadCommentReplyPage({ reader: visitorReader, parentCommentId: commentId })
	check(
		"the reply page holds both replies with no next page",
		replyPage.replies.length === 2 && replyPage.nextCursor === null,
	)

	// an edit inside the edit time replaces the body and its mentions, and one past it is locked
	const edited = await editComment({ userId: userIds.follower, commentId, body: "no mention now" })
	check("an edit replaces the body and the mentions", edited.status === "saved" && edited.comment.mentions.length === 0)
	check(
		"another user's edit reads as missing",
		(await editComment({ userId: userIds.stranger, commentId, body: "x" })).status === "notFound",
	)
	await db.update(comments).set({ createdAt: pastEditTime }).where(eq(comments.id, commentId))
	check(
		"an edit past the edit time is locked",
		(await editComment({ userId: userIds.follower, commentId, body: "late" })).status === "locked",
	)

	// a user block hides the comment from both people, whichever of them made it, and lifting it brings the comment back
	const isCommentShownToStranger = async (): Promise<boolean> => {
		const strangerPage = await loadCommentPage({
			reader: toPlainReader(userIds.stranger),
			target: firstTopic,
			topic: firstTopicRow,
		})
		return strangerPage.comments.some((comment) => comment.id === commentId)
	}
	await saveUserBlock(userIds.stranger, userIds.follower)
	check("a block the reader made hides the comment", !(await isCommentShownToStranger()))
	await deleteUserBlock(userIds.stranger, userIds.follower)

	// the other direction
	await saveUserBlock(userIds.follower, userIds.stranger)
	check("a block of the reader hides the comment", !(await isCommentShownToStranger()))
	await deleteUserBlock(userIds.follower, userIds.stranger)
	check("a lifted block shows the comment again", await isCommentShownToStranger())

	// a comment its reader flagged stays in that reader's thread, marked as reported for them alone
	await db.insert(reports).values({
		subjectKind: "comment",
		subjectId: commentId,
		subjectAuthorUserId: userIds.follower,
		reporterUserId: userIds.owner,
		reason: "",
		subjectText: "no mention now",
		subjectPath: "/",
	})
	const loadComment = async (userId: string | null): Promise<Comment | undefined> => {
		const commentPage = await loadCommentPage({
			reader: toPlainReader(userId ?? ""),
			target: firstTopic,
			topic: firstTopicRow,
		})
		return commentPage.comments.find((comment) => comment.id === commentId)
	}
	check(
		"a flagged comment stays reported in its reporter's thread",
		(await loadComment(userIds.owner))?.isReported === true,
	)
	check("a flagged comment reads as unreported for everyone else", (await loadComment(null))?.isReported === false)

	// a cleared report stays closed for the same text, reopens for changed text, and its removal keeps it closed
	const reportSubject = {
		kind: "comment",
		id: commentId,
		label: "comment",
		authorUserId: userIds.follower,
		text: "no mention now",
		path: "/",
	} as const
	const toOwnerReport = async (): Promise<typeof reports.$inferSelect | undefined> => {
		const [reportRow] = await db.select().from(reports).where(eq(reports.subjectId, commentId))
		return reportRow
	}
	const saveOwnerReport = (text: string): Promise<string | null> =>
		saveReport({ reporterUserId: userIds.owner, subject: { ...reportSubject, text }, reason: "again" })

	// clear the report, keeping the hash of the text it was about
	await db
		.update(reports)
		.set({
			resolution: "cleared",
			resolvedAt: new Date(),
			subjectText: "",
			clearedTextHash: toReportTextHash("no mention now"),
		})
		.where(eq(reports.subjectId, commentId))
	check("a repeat of cleared text stays closed", (await saveOwnerReport("no mention now")) === null)
	check("changed text reopens a cleared report", (await saveOwnerReport("something new")) !== null)
	check(
		"a reopened report is open with the new text",
		(await toOwnerReport())?.subjectText === "something new" && !(await toOwnerReport())?.resolvedAt,
	)
	await removeReport(userIds.owner, "comment", commentId)
	check("removing an open report deletes it", (await toOwnerReport()) === undefined)
	await db.insert(reports).values({
		subjectKind: "comment",
		subjectId: commentId,
		subjectAuthorUserId: userIds.follower,
		reporterUserId: userIds.owner,
		reason: "",
		subjectText: "",
		subjectPath: "/",
		resolution: "cleared",
		resolvedAt: new Date(),
		clearedTextHash: toReportTextHash("no mention now"),
	})
	await removeReport(userIds.owner, "comment", commentId)
	check("a removed report empties the flag", (await loadComment(userIds.owner))?.isReported === false)
	check("a removed cleared report keeps its resolution", (await toOwnerReport())?.resolution === "cleared")
	check("reporting the same text again stays closed", (await saveOwnerReport("no mention now")) === null)
	check("that repeat fills the flag again", (await loadComment(userIds.owner))?.isReported === true)

	// a thread reads its top-level comments newest first in pages of twenty, with the replies left out of the count
	await db.insert(comments).values(
		Array.from({ length: 22 }, (_unused, index) => ({
			authorUserId: userIds.stranger,
			topicId: topicIds.first,
			targetTopicId: topicIds.first,
			body: `comment ${index}`,
			createdAt: new Date(Date.now() - (30 - index) * 1000),
		})),
	)
	const firstPage = await loadCommentPage({ reader: visitorReader, target: firstTopic, topic: firstTopicRow })
	const secondPage = await loadCommentPage({
		reader: visitorReader,
		target: firstTopic,
		topic: firstTopicRow,
		cursor: firstPage.nextCursor ?? undefined,
	})
	check(
		"the first page holds the newest twenty",
		firstPage.comments.length === 20 && firstPage.comments[0]?.body === "comment 21",
	)
	check(
		"the second page holds the remainder",
		secondPage.comments.length === 3 && secondPage.nextCursor === null,
		secondPage.comments.length,
	)
	check("a visitor's page has no shared comment slots", firstPage.sharedCommentSlots === null)

	// the topic's owner deletes anyone's comment and its replies, and a stranger does not
	check(
		"another user cannot delete a comment",
		(await deleteComment({ userId: userIds.stranger, commentId, analyticsProperties })).status === "notFound",
	)
	check(
		"the topic's owner deletes a comment",
		(await deleteComment({ userId: userIds.owner, commentId, analyticsProperties })).status === "deleted",
	)
	check(
		"the delete takes the replies with it",
		(await db.select().from(comments).where(eq(comments.parentCommentId, commentId))).length === 0,
	)
}

// the shared comment slots a share or a delete returned, or null if it ended otherwise
function toResultSharedCommentSlots(
	result: Awaited<ReturnType<typeof shareComment>> | Awaited<ReturnType<typeof deleteComment>>,
): { usedCount: number; slotCount: number } | null {
	return result.status === "saved" || result.status === "deleted" ? (result.sharedCommentSlots ?? null) : null
}

async function checkCommentMentions(): Promise<void> {
	// the ids of the Comments a user's unseen mentions sit in
	const loadUnseenCommentIds = async (userId: string): Promise<string[]> =>
		(await loadUnseenCommentMentions(userId)).map((unseenCommentMention) => unseenCommentMention.commentId)

	// a mention of another user is unseen, with the Comment's first line and the path that opens it
	const mentioningComment = toSavedComment(
		await post(userIds.follower, `ping @${userIds.owner} and @${userIds.follower}\nsecond line`),
	)
	const mentioningCommentId = mentioningComment?.id ?? ""
	const ownerMention = (await loadUnseenCommentMentions(userIds.owner)).find(
		(unseenCommentMention) => unseenCommentMention.commentId === mentioningCommentId,
	)
	check("a mention is listed as unseen", ownerMention !== undefined)
	check(
		"the mention has the first line alone",
		ownerMention?.text.endsWith(`@${userIds.follower}`) === true,
		ownerMention,
	)
	check("the mention's path names the comment", ownerMention?.path.endsWith(`comment=${mentioningCommentId}`) === true)
	check(
		"the mention names the topic's page",
		ownerMention?.page.kind === "topic" && ownerMention.page.id === topicIds.first,
	)
	check(
		"an author's own mention is not listed",
		!(await loadUnseenCommentIds(userIds.follower)).includes(mentioningCommentId),
	)

	// a second read returns the cached list, whatever the rows say now
	const ownerMentionFilter = and(
		eq(commentMentions.commentId, mentioningCommentId),
		eq(commentMentions.mentionedUserId, userIds.owner),
	)
	await db.update(commentMentions).set({ seenAt: new Date() }).where(ownerMentionFilter)
	check("a second read comes from the cache", (await loadUnseenCommentIds(userIds.owner)).includes(mentioningCommentId))
	await clearUnseenCommentMentions([userIds.owner])
	check(
		"a cleared cache reads the rows again",
		!(await loadUnseenCommentIds(userIds.owner)).includes(mentioningCommentId),
	)

	// an edit keeps a seen mention seen, adds an unseen one, and drops one
	await editComment({
		userId: userIds.follower,
		commentId: mentioningCommentId,
		body: `ping @${userIds.owner} and @${userIds.stranger}`,
	})
	check("an edit keeps a seen mention seen", !(await loadUnseenCommentIds(userIds.owner)).includes(mentioningCommentId))
	check("an edit adds an unseen mention", (await loadUnseenCommentIds(userIds.stranger)).includes(mentioningCommentId))
	await editComment({ userId: userIds.follower, commentId: mentioningCommentId, body: `ping @${userIds.owner}` })
	check("an edit drops a mention", !(await loadUnseenCommentIds(userIds.stranger)).includes(mentioningCommentId))

	// a user block in either direction hides a mention, and lifting it brings the mention back
	const strangerComment = toSavedComment(await post(userIds.stranger, `hey @${userIds.owner}`))
	const strangerCommentId = strangerComment?.id ?? ""
	const isStrangerMentionListed = async (): Promise<boolean> =>
		(await loadUnseenCommentIds(userIds.owner)).includes(strangerCommentId)
	check("another user's mention is listed", await isStrangerMentionListed())
	await saveUserBlock(userIds.owner, userIds.stranger)
	check("a block the mentioned user made hides the mention", !(await isStrangerMentionListed()))
	await deleteUserBlock(userIds.owner, userIds.stranger)

	// the other direction
	await saveUserBlock(userIds.stranger, userIds.owner)
	check("a block of the mentioned user hides the mention", !(await isStrangerMentionListed()))
	await deleteUserBlock(userIds.stranger, userIds.owner)
	check("a lifted block lists the mention again", await isStrangerMentionListed())

	// an author under an admin block mentions nobody
	await db.update(users).set({ adminBlockedAt: new Date() }).where(eq(users.id, userIds.stranger))
	await clearUnseenCommentMentions([userIds.owner])
	check("an admin block hides the author's mention", !(await isStrangerMentionListed()))
	await db.update(users).set({ adminBlockedAt: null }).where(eq(users.id, userIds.stranger))
	await clearUnseenCommentMentions([userIds.owner])

	// a mention on a private Topic reaches its owner and never a user who may not open it
	const privateComment = toSavedComment(await post(userIds.owner, `psst @${userIds.stranger}`))
	const privateCommentId = privateComment?.id ?? ""
	await db.update(topics).set({ visibility: "private" }).where(eq(topics.id, topicIds.first))
	await clearUnseenCommentMentions([userIds.stranger])
	check(
		"a private Topic's mention is not listed",
		!(await loadUnseenCommentIds(userIds.stranger)).includes(privateCommentId),
	)
	await db.update(topics).set({ visibility: "public" }).where(eq(topics.id, topicIds.first))
	await clearUnseenCommentMentions([userIds.stranger])
	check("a public Topic's mention is listed", (await loadUnseenCommentIds(userIds.stranger)).includes(privateCommentId))

	// a mention on a Finding names the Finding in its path, and a thumbs down takes it off the list
	const findingId = await seedFinding()
	const findingComment = toSavedComment(
		await postComment({
			userId: userIds.follower,
			payload: { target: { kind: "finding", id: findingId }, body: `look @${userIds.owner}` },
			analyticsProperties,
		}),
	)
	const findingMention = (await loadUnseenCommentMentions(userIds.owner)).find(
		(unseenCommentMention) => unseenCommentMention.commentId === findingComment?.id,
	)
	check(
		"a Finding's mention opens the Topic's page at the Finding",
		findingMention?.page.kind === "topic" && findingMention.path.includes(`finding=${findingId}`),
		findingMention,
	)
	await db.update(findings).set({ rating: "down" }).where(eq(findings.id, findingId))
	await clearUnseenCommentMentions([userIds.owner])
	check(
		"a thumbs down Finding's mention is not listed",
		!(await loadUnseenCommentIds(userIds.owner)).includes(findingComment?.id ?? ""),
	)

	// a seen mark of one Comment leaves the others, and a deleted Comment takes its mention with it
	const seenCount = await saveSeenCommentMentions({
		userId: userIds.stranger,
		payload: { commentIds: [privateCommentId] },
		analyticsProperties,
	})
	check("a seen mark returns how many it marked", seenCount === 1, seenCount)
	check("a seen mention leaves the list", !(await loadUnseenCommentIds(userIds.stranger)).includes(privateCommentId))
	await deleteComment({ userId: userIds.stranger, commentId: strangerCommentId, analyticsProperties })
	check("a deleted Comment takes its mention with it", !(await isStrangerMentionListed()))

	// Mark all seen empties the list
	const secondComment = toSavedComment(await post(userIds.follower, `again @${userIds.owner}`))
	check("a new mention is listed", (await loadUnseenCommentIds(userIds.owner)).includes(secondComment?.id ?? ""))
	await saveSeenCommentMentions({ userId: userIds.owner, payload: { isEveryMention: true }, analyticsProperties })
	check("Mark all seen empties the list", (await loadUnseenCommentIds(userIds.owner)).length === 0)

	// delete the owner's Comment, which holds a shared comment slot
	await deleteComment({ userId: userIds.owner, commentId: privateCommentId, analyticsProperties })
}

async function checkLinkedComment(): Promise<void> {
	// the second topic's thread: one old Comment with five replies, under twenty newer Comments that fill the first page
	const secondTopic = { kind: "topic", id: topicIds.second } as const
	const secondTopicRow = { ...firstTopicRow, id: topicIds.second }
	const oldCommentId = `${runId}-linked-old`
	const toLinkedRow = (id: string, minutesAgo: number, parentCommentId?: string): typeof comments.$inferInsert => ({
		id,
		authorUserId: userIds.follower,
		topicId: topicIds.second,
		targetTopicId: topicIds.second,
		parentCommentId,
		body: id,
		createdAt: new Date(Date.now() - minutesAgo * 60_000),
	})
	await db.insert(comments).values(toLinkedRow(oldCommentId, 600))
	await db
		.insert(comments)
		.values([
			...Array.from({ length: 5 }, (_, i) => toLinkedRow(`${runId}-linked-reply-${i + 1}`, 500 - i, oldCommentId)),
			...Array.from({ length: 20 }, (_, i) => toLinkedRow(`${runId}-linked-new-${i + 1}`, 100 - i)),
		])

	// a read of the thread as the owner, with or without the Comment a link names
	const loadLinkedPage = (commentId?: string): ReturnType<typeof loadCommentPage> =>
		loadCommentPage({ reader: toPlainReader(userIds.owner), target: secondTopic, topic: secondTopicRow, commentId })

	// the first page alone never reaches the old Comment
	const plainPage = await loadLinkedPage()
	check(
		"the first page leaves out a Comment older than it",
		plainPage.comments.length === 20 && plainPage.comments.every((comment) => comment.id !== oldCommentId),
	)

	// a link to the old Comment leads the page with it, and the cursor still continues the newest-first page
	const oldCommentPage = await loadLinkedPage(oldCommentId)
	check("a linked old Comment leads the page", oldCommentPage.comments[0]?.id === oldCommentId)
	check("a linked Comment's page keeps the newest twenty after it", oldCommentPage.comments.length === 21)
	check("a linked Comment's page keeps its next cursor", oldCommentPage.nextCursor === plainPage.nextCursor)
	check("a linked top-level Comment shows its first replies", oldCommentPage.comments[0]?.replies.length === 3)

	// a link to a reply leads with its top-level Comment and every reply up to the linked one
	const replyPage = await loadLinkedPage(`${runId}-linked-reply-5`)
	const replyIds = replyPage.comments[0]?.replies.map((reply) => reply.id) ?? []
	check("a linked reply leads the page with its top-level Comment", replyPage.comments[0]?.id === oldCommentId)
	check(
		"a linked reply's thread holds every reply up to it",
		replyIds.length === 5 && replyIds.at(-1) === `${runId}-linked-reply-5`,
		replyIds,
	)
	check("a linked reply's Comment still counts its replies", replyPage.comments[0]?.replyCount === 5)
	const fourthReplyPage = await loadLinkedPage(`${runId}-linked-reply-4`)
	check("a linked reply's thread stops at it", fourthReplyPage.comments[0]?.replies.length === 4)

	// a link to a Comment that is gone, or to one on another thread, reads the page as usual
	const missingPage = await loadLinkedPage(`${runId}-linked-missing`)
	check(
		"a link to a deleted Comment reads the page as usual",
		missingPage.comments.length === 20 && missingPage.comments[0]?.id === plainPage.comments[0]?.id,
	)
	const otherThreadPage = await loadCommentPage({
		reader: toPlainReader(userIds.stranger),
		target: firstTopic,
		topic: firstTopicRow,
		commentId: oldCommentId,
	})
	check(
		"a link to another thread's Comment is not shown on this one",
		otherThreadPage.comments.every((comment) => comment.id !== oldCommentId),
	)

	// delete the thread's rows
	await db.delete(comments).where(like(comments.id, `${runId}-linked-%`))
}

async function checkTopicPostComment(): Promise<void> {
	// a published Topic Post by the owner on the first topic, which the topic's delete removes
	const topicPostId = `${runId}-topic-post`
	const topicPostTarget = { kind: "post", id: topicPostId } as const
	await db.insert(topicPosts).values({
		id: topicPostId,
		topicId: topicIds.first,
		authorUserId: userIds.owner,
		title: "smoke post",
		html: "<p>smoke post</p>",
		publishedAt: new Date(),
	})

	// the owner's comment on the post is saved unshared, though a shared comment slot is free
	const topicPostCommentResult = await postComment({
		userId: userIds.owner,
		payload: { target: topicPostTarget, body: "a take on the post" },
		analyticsProperties,
	})
	const topicPostComment = toSavedComment(topicPostCommentResult)
	check(
		"an editor's comment on a Topic Post starts unshared",
		topicPostComment?.isSharedWithPodcast === false,
		topicPostCommentResult,
	)

	// its row names the post's topic and no share
	const [topicPostCommentRow] = await db
		.select()
		.from(comments)
		.where(eq(comments.id, topicPostComment?.id ?? ""))
	check(
		"a comment on a Topic Post stores the post's topic",
		topicPostCommentRow?.targetTopicId === topicIds.first && topicPostCommentRow.sharedWithPodcastAt === null,
		topicPostCommentRow,
	)

	// the post's thread holds it for a visitor
	const topicPostPage = await loadCommentPage({ reader: visitorReader, target: topicPostTarget, topic: firstTopicRow })
	check(
		"the Topic Post's thread holds the comment",
		topicPostPage.comments.some((comment) => comment.id === topicPostComment?.id),
		topicPostPage.comments,
	)

	// delete the post, which takes its thread with it
	await db.delete(topicPosts).where(eq(topicPosts.id, topicPostId))
}

async function checkSharedComments(): Promise<void> {
	// the owner may share, and their own top-level comment is shared while a shared comment slot is free
	const ownerReader = await toSocialReader(userIds.owner, firstTopicRow)
	check("the topic's owner may share", ownerReader.canShare && ownerReader.canModerate, ownerReader)
	const ownerPost = await post(userIds.owner, `worth a read https://example.org/${runId}`)
	const ownerComment = toSavedComment(ownerPost)
	const ownerPostSharedCommentSlots = ownerPost.status === "saved" ? ownerPost.sharedCommentSlots : null
	check(
		"an editor's top-level comment is shared with the podcast",
		ownerComment?.isSharedWithPodcast === true,
		ownerPost,
	)
	check(
		"the post returns the shared comment slots with one used of three",
		ownerPostSharedCommentSlots?.usedCount === 1 && ownerPostSharedCommentSlots.slotCount === 3,
		ownerPostSharedCommentSlots ?? ownerPost,
	)

	// the owner shares a follower's comment, fills the shared comment slots, and is told if none is free
	const followerCommentIds: string[] = []
	for (const body of ["second take", "third take", "fourth take"]) {
		followerCommentIds.push(toSavedComment(await post(userIds.follower, body))?.id ?? "")
	}
	const share = (userId: string, commentId: string, isSharedWithPodcast: boolean): ReturnType<typeof shareComment> =>
		shareComment({ userId, commentId, isSharedWithPodcast, analyticsProperties })
	const [firstCommentId = "", secondCommentId = "", thirdCommentId = ""] = followerCommentIds

	// two more shares fill the three shared comment slots
	const secondShare = await share(userIds.owner, firstCommentId, true)
	check("the owner shares a follower's comment", toResultSharedCommentSlots(secondShare)?.usedCount === 2, secondShare)
	check(
		"the third share fills the shared comment slots",
		toResultSharedCommentSlots(await share(userIds.owner, secondCommentId, true))?.usedCount === 3,
	)
	check(
		"a fourth share finds no free shared comment slot",
		(await share(userIds.owner, thirdCommentId, true)).status === "noFreeSharedCommentSlot",
	)
	check("a follower may not share", (await share(userIds.follower, thirdCommentId, true)).status === "notFound")

	// the shared comments list most recently shared first, and a Scan reads their texts
	const sharedComments = await loadSharedComments(firstTopicRow, userIds.owner)
	const sharedBodies = sharedComments.map((sharedComment) => sharedComment.body)
	check(
		"the shared comments list most recently shared first",
		sharedBodies.join() === `third take,second take,worth a read https://example.org/${runId}`,
		sharedBodies,
	)
	const sharedCommentTexts = await loadSharedCommentTexts(topicIds.first)
	check(
		"a Scan reads the shared texts with their authors",
		sharedCommentTexts.length === 3 && sharedCommentTexts.some((sharedText) => sharedText.username === userIds.owner),
		sharedCommentTexts,
	)

	// taking one back frees its shared comment slot, and a page for the owner shows the shared comment slots
	const unshare = await share(userIds.owner, firstCommentId, false)
	check(
		"taking a share back frees its shared comment slot",
		toResultSharedCommentSlots(unshare)?.usedCount === 2,
		unshare,
	)
	const ownerPage = await loadCommentPage({ reader: ownerReader, target: firstTopic, topic: firstTopicRow })
	check(
		"the owner's page holds the shared comment slots",
		ownerPage.sharedCommentSlots?.usedCount === 2,
		ownerPage.sharedCommentSlots,
	)
	check(
		"the page marks the shared comments",
		ownerPage.comments.filter((comment) => comment.isSharedWithPodcast).length === 2,
	)

	// a delete of a shared comment frees its shared comment slot too
	const deleted = await deleteComment({ userId: userIds.owner, commentId: ownerComment?.id ?? "", analyticsProperties })
	check(
		"a delete returns the freed shared comment slots",
		toResultSharedCommentSlots(deleted)?.usedCount === 1,
		deleted,
	)
}

// seed, run every check, and clean up whatever happened
try {
	// the rows every check reads
	await seed()
	await checkReactions()
	await checkComments()
	await checkCommentMentions()
	await checkLinkedComment()
	await checkTopicPostComment()
	await checkSharedComments()
} finally {
	// undo the run's rows whether a check threw or not
	await cleanUp()
	await connectionPool.end()
}
console.log(failureCount === 0 ? "social smoke passed" : `social smoke failed: ${failureCount}`)
process.exit(failureCount === 0 ? 0 : 1)
