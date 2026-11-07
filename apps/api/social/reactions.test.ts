// reaction write tests: who may save, the one row per user per social target, the daily count, the removal, and
// the events
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { EMPTY_REACTION_SUMMARY, type ReactionType } from "@carlnotes/contracts/social"
import { FREE_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as socialLimits from "@carlnotes/db/socialLimits"
import * as analytics from "@carlnotes/server/analytics"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import * as reactionRows from "./reactionRows"
import { saveReaction } from "./reactions"
import * as socialTargets from "./socialTargets"
import { RESOLVED_FINDING } from "./socialTargetTestFixtures"

// the collaborators every case spies on: the daily count and the event
let countSocialWriteToday: ReturnType<typeof spyOn<typeof socialLimits, "countSocialWriteToday">>
let trackEvent: ReturnType<typeof spyOn<typeof analytics, "trackEvent">>

// resolve the Finding, accept the count, and return the empty summary, unless a case says otherwise
beforeEach(() => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	spyOn(reactionRows, "loadReactionSummary").mockResolvedValue(EMPTY_REACTION_SUMMARY)
	countSocialWriteToday = spyOn(socialLimits, "countSocialWriteToday").mockResolvedValue(true)
	trackEvent = spyOn(analytics, "trackEvent").mockImplementation(() => {})
})

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a save on the Finding as one user
function save(userId: string, reactionType: ReactionType | null): ReturnType<typeof saveReaction> {
	return saveReaction({
		userId,
		payload: { target: RESOLVED_FINDING.commentTarget, reactionType },
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
}

// the connection pool's rows for a user with no admin block: their access row, the type of the reaction they hold on the
// Finding, and the row a removal deletes
function stubReactionRows({
	ownReactionType,
	hasRowToDelete = false,
}: {
	ownReactionType?: ReactionType
	hasRowToDelete?: boolean
} = {}): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// the access row, then the removal's deleted row
		if (text.includes('from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}
		if (text.startsWith('delete from "reactions"')) {
			return hasRowToDelete ? [["reaction-1"]] : []
		}

		// the type of the reaction the user holds on the Finding, if any
		return text.includes('from "reactions"') && ownReactionType ? [[ownReactionType]] : []
	})
}

// the upserts a run sent
function toUpsertQueries(sentQueries: ReturnType<typeof stubConnectionPool>): ReturnType<typeof stubConnectionPool> {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "reactions"'))
}

test("a social target the user cannot open reads as not found, with nothing written", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(null)
	const sentQueries = stubReactionRows()
	expect(await save("user-1", "like")).toEqual({ status: "notFound" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
})

test("a new reaction is one upsert, counted against the day, and sends a react event", async () => {
	const sentQueries = stubReactionRows()
	expect(await save("user-1", "insightful")).toEqual({ status: "saved", summary: EMPTY_REACTION_SUMMARY })

	// one upsert on the user and the Finding, with the type
	const [upsertQuery] = toUpsertQueries(sentQueries)
	expect(toUpsertQueries(sentQueries)).toHaveLength(1)
	expect(upsertQuery?.text).toContain("on conflict")
	expect(upsertQuery?.values).toEqual(expect.arrayContaining(["user-1", "finding-1", "insightful"]))
	expect(countSocialWriteToday).toHaveBeenCalledWith("user-1", "reaction")
	expect(trackEvent).toHaveBeenCalledWith("social_finding_react", "user-1", {
		...TEST_ANALYTICS_PROPERTIES,
		objectId: "finding-1",
		topicId: "topic-1",
		isOwner: false,
	})
})

test("a new reaction past the day's limit is rejected", async () => {
	countSocialWriteToday.mockResolvedValue(false)
	const sentQueries = stubReactionRows()
	expect(await save("user-1", "like")).toEqual({ status: "limitReached" })
	expect(toUpsertQueries(sentQueries)).toHaveLength(0)
	expect(trackEvent).not.toHaveBeenCalled()
})

test("a change of type is saved on the same row and does not count against the day", async () => {
	const sentQueries = stubReactionRows({ ownReactionType: "like" })
	expect((await save("owner-1", "love")).status).toBe("saved")
	expect(toUpsertQueries(sentQueries)).toHaveLength(1)
	expect(countSocialWriteToday).not.toHaveBeenCalled()

	// the Topic's owner is flagged on the event
	expect(trackEvent).toHaveBeenCalledWith("social_finding_react", "owner-1", expect.objectContaining({ isOwner: true }))
})

test("the same type again changes nothing", async () => {
	const sentQueries = stubReactionRows({ ownReactionType: "like" })
	expect((await save("user-1", "like")).status).toBe("saved")
	expect(toUpsertQueries(sentQueries)).toHaveLength(0)
	expect(countSocialWriteToday).not.toHaveBeenCalled()
	expect(trackEvent).not.toHaveBeenCalled()
})

test("no type removes the user's own reaction and sends the delete event", async () => {
	const sentQueries = stubReactionRows({ hasRowToDelete: true })
	expect((await save("user-1", null)).status).toBe("saved")
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "reactions"'))
	expect(deleteQuery?.values).toEqual(expect.arrayContaining(["finding-1", "user-1"]))
	expect(countSocialWriteToday).not.toHaveBeenCalled()
	expect(trackEvent).toHaveBeenCalledWith("social_reaction_delete", "user-1", {
		...TEST_ANALYTICS_PROPERTIES,
		objectId: "finding-1",
		topicId: "topic-1",
		isOwner: false,
	})
})

test("no type on a social target the user never reacted to is saved with no event", async () => {
	stubReactionRows()
	expect((await save("user-1", null)).status).toBe("saved")
	expect(trackEvent).not.toHaveBeenCalled()
})

test("a reaction to a comment writes the comment's column and sends a hot take react event", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	const sentQueries = stubReactionRows()
	expect(
		(
			await saveReaction({
				userId: "user-1",
				payload: { target: { kind: "comment", id: "comment-1" }, reactionType: "funny" },
				analyticsProperties: TEST_ANALYTICS_PROPERTIES,
			})
		).status,
	).toBe("saved")

	// the upsert names the comment, and the event reads it as a hot take on the Finding's Topic
	const [upsertQuery] = toUpsertQueries(sentQueries)
	expect(upsertQuery?.text).toContain('"comment_id"')
	expect(upsertQuery?.values).toEqual(expect.arrayContaining(["comment-1", "funny"]))
	expect(trackEvent).toHaveBeenCalledWith(
		"social_hot_take_react",
		"user-1",
		expect.objectContaining({ objectId: "comment-1", topicId: "topic-1" }),
	)
})
