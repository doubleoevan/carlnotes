// a live smoke test for reactions and comments against the dev database: one reaction per user per social target, the
// summary of one and many, the admin block, the mentions, the replies and their pages, the edit time, the user blocks,
// the reports, the paged thread, the editor's share with Carl and its shared comment slots, and the deletes
// run it with: bun run smoke:social. needs Doppler secrets

import type { Comment } from "@carlnotes/contracts/social"
import type { SocialReader } from "./socialRows"

// no model call and no analytics event leaves this run
delete Bun.env.LITELLM_BASE_URL
delete Bun.env.POSTHOG_API_KEY

const { connectionPool, db } = await import("@carlnotes/db")
const { reports } = await import("@carlnotes/db/schema/reports")
const { comments, reactions } = await import("@carlnotes/db/schema/social")
const { topics } = await import("@carlnotes/db/schema/topics")
const { users } = await import("@carlnotes/db/schema/users")
const { loadSharedCommentTexts } = await import("@carlnotes/db/sharedComments")
const { eq, inArray, like } = await import("drizzle-orm")

// the reads and writes under test, loaded after the env is cleared
const { removeReport, saveReport, toReportTextHash } = await import("../report/reports")
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

// delete the run's topics and users, which takes every reaction, comment, and report with them
async function cleanUp(): Promise<void> {
	await db.delete(topics).where(inArray(topics.id, Object.values(topicIds)))
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
	check("a follower's post is not shared with Carl", postedComment?.isSharedWithCarl === false)
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

	// a reply joins its parent, a reply to a reply joins the same parent, and a parent on another target is missing
	const reply = toSavedComment(await post(userIds.owner, "first reply", { parentCommentId: commentId }))
	const replyToReply = toSavedComment(await post(userIds.stranger, "second reply", { parentCommentId: reply?.id }))
	check("a reply names its parent", reply?.parentCommentId === commentId, reply)
	check("a reply to a reply joins that reply's parent", replyToReply?.parentCommentId === commentId, replyToReply)
	check("an owner's reply is not shared with Carl", reply?.isSharedWithCarl === false)
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

async function checkSharedComments(): Promise<void> {
	// the owner may share, and their own top-level comment is shared while a shared comment slot is free
	const ownerReader = await toSocialReader(userIds.owner, firstTopicRow)
	check("the topic's owner may share", ownerReader.canShare && ownerReader.canModerate, ownerReader)
	const ownerPost = await post(userIds.owner, `worth a read https://example.org/${runId}`)
	const ownerComment = toSavedComment(ownerPost)
	const ownerPostSharedCommentSlots = ownerPost.status === "saved" ? ownerPost.sharedCommentSlots : null
	check("an editor's top-level comment is shared with Carl", ownerComment?.isSharedWithCarl === true, ownerPost)
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
	const share = (userId: string, commentId: string, isSharedWithCarl: boolean): ReturnType<typeof shareComment> =>
		shareComment({ userId, commentId, isSharedWithCarl, analyticsProperties })
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
		ownerPage.comments.filter((comment) => comment.isSharedWithCarl).length === 2,
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
	await checkSharedComments()
} finally {
	// undo the run's rows whether a check threw or not
	await cleanUp()
	await connectionPool.end()
}
console.log(failureCount === 0 ? "social smoke passed" : `social smoke failed: ${failureCount}`)
process.exit(failureCount === 0 ? 0 : 1)
