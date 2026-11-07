// social report subject tests: a Finding, a Podcast Episode, and a comment are reportable by someone who may open
// what they hang on, and a comment reads as a hot take on its social target
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { comments } from "@carlnotes/db/schema/social"
import * as socialTargets from "../social/socialTargets"
import { RESOLVED_FINDING } from "../social/socialTargetTestFixtures"
import { toReportedSubject } from "./reportSubjects"

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("a Finding is reported by its title, with the Topic's owner as its author", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	expect(await toReportedSubject("user-1", { subjectKind: "finding", subjectId: "finding-1" })).toEqual({
		kind: "finding",
		id: "finding-1",
		label: "A Good Page",
		path: "/topics/topic-1/coffee?finding=finding-1",
		text: "A Good Page",
		authorUserId: "owner-1",
	})
})

test("a comment is reported with its body and author, as a hot take on its social target", async () => {
	const resolveSocialTarget = spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	stubConnectionPool(() => [
		toTableRow(comments, { id: "comment-1", authorUserId: "author-1", findingId: "finding-1", body: "rude words" }),
	])
	const reportedComment = await toReportedSubject("user-1", { subjectKind: "comment", subjectId: "comment-1" })
	expect(reportedComment).toMatchObject({ kind: "comment", text: "rude words", authorUserId: "author-1" })
	expect(reportedComment?.label).toBe("a hot take on A Good Page")
	expect(reportedComment?.path).toBe(RESOLVED_FINDING.path)

	// the comment resolves through what it hangs on
	expect(resolveSocialTarget).toHaveBeenCalledWith("user-1", { kind: "finding", id: "finding-1" })
})

test("a missing comment reads as missing, with nothing resolved", async () => {
	const resolveSocialTarget = spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	stubConnectionPool()
	expect(await toReportedSubject("user-1", { subjectKind: "comment", subjectId: "missing" })).toBeNull()
	expect(resolveSocialTarget).not.toHaveBeenCalled()
})

test("a subject on a social target the reporter may not open reads as missing", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(null)
	stubConnectionPool(() => [
		toTableRow(comments, { id: "comment-1", authorUserId: "author-1", topicId: "topic-2", body: "private words" }),
	])
	expect(await toReportedSubject("user-1", { subjectKind: "comment", subjectId: "comment-1" })).toBeNull()
	expect(await toReportedSubject("user-1", { subjectKind: "podcastEpisode", subjectId: "episode-1" })).toBeNull()
})
