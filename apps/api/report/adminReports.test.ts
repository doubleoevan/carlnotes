// admin report tests: the open list shapes each report with its people, whether its content is gone, and the avatar or
// the images that Remove would take down. Clear closes a report without touching the content, and Block puts an admin
// block on the author
import { afterEach, expect, test } from "bun:test"
import { toPodcastEpisodeImageUrls, toTopicPodcastEpisodeVideoPosterUrl } from "@carlnotes/contracts/topicImages"
import { stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadOpenReports } from "./adminReports"
import {
	expectReportClosed,
	OPEN_REPORT_ROW,
	PROVIDER_PHOTO_URL,
	resolveOpenReport,
	restoreAdminReportTest,
	toOpenReportRow,
} from "./adminReportTestFixtures"
import { toReportTextHash } from "./reports"

// put the connection pool, the auth secret, and every spy back after each test
afterEach(restoreAdminReportTest)

// the list shapes the report, and a comment that no longer exists shows as gone
test("the open list shapes each report and marks gone content", async () => {
	// two reports of two comments, of which only the first comment still exists
	stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [OPEN_REPORT_ROW, toOpenReportRow({ subjectKind: "noteComment", subjectId: "c2" })]
		}
		return text.includes('from "note_comments"') ? [["c1"]] : []
	})

	// the first report in full, and the second marked gone
	const openReports = await loadOpenReports()
	expect(openReports).toHaveLength(2)
	expect(openReports[0]).toEqual({
		id: "report-1",
		subjectKind: "noteComment",
		subjectId: "c1",
		subjectText: "you smell",
		subjectPath: "/topics/topic-1/raccoons",
		subjectImage: null,
		subjectAvatarVersion: null,
		topicPodcastEpisodeVideoPosterUrl: null,
		reason: "rude",
		createdAt: "2026-10-29T10:00:00.000Z",
		author: { id: "user-2", username: "vienna" },
		reporter: { id: "user-1", username: "doubleoevan" },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	})
	expect(openReports[1]?.isSubjectDeleted).toBe(true)
})

// a profile report shows a published avatar and offers its reset, and a profile on the initials offers neither
test("the open list offers the reset on a profile with an upload or a published provider photo alone", async () => {
	// three profile reports, and each profile's avatar columns
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return ["user-upload", "user-provider", "user-initials"].map((subjectId) =>
				toOpenReportRow({ subjectKind: "profile", subjectId }),
			)
		}

		// an upload, a published provider photo, and a provider photo its user never published
		return text.includes('from "users"')
			? [
					["user-upload", "upload", "avatars/user-upload/upload-version.png", null],
					["user-provider", "oauth", null, PROVIDER_PHOTO_URL],
					["user-initials", "generated", null, PROVIDER_PHOTO_URL],
				]
			: []
	})
	const openReports = await loadOpenReports()

	// the upload's version and the provider photo's, and no avatar and no reset for the initials
	expect(openReports.map((openReport) => openReport.subjectAvatarVersion)).toEqual(["upload-version", "oauth", null])
	expect(openReports.map((openReport) => openReport.canRemove)).toEqual([true, true, false])
	expect(openReports.some((openReport) => openReport.isSubjectDeleted)).toBe(false)

	// one read covers the three profiles, beside the read of the reports
	expect(sentQueries).toHaveLength(2)
})

// a team report shows an uploaded avatar and offers its reset, and a team with no avatar offers neither
test("the open list offers the reset on a team with an uploaded avatar alone", async () => {
	// two team reports, and each team's stored avatar
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return ["team-avatar", "team-initials"].map((subjectId) => toOpenReportRow({ subjectKind: "team", subjectId }))
		}
		return text.includes('from "teams"')
			? [
					["team-avatar", "avatars/teams/team-avatar/team-version.webp"],
					["team-initials", null],
				]
			: []
	})
	const openReports = await loadOpenReports()

	// the upload's version with the reset, and neither for the team with no avatar, in one read beside the reports
	expect(openReports.map((openReport) => openReport.subjectAvatarVersion)).toEqual(["team-version", null])
	expect(openReports.map((openReport) => openReport.canRemove)).toEqual([true, false])
	expect(sentQueries).toHaveLength(2)
})

// a podcast episode report shows the podcast episode's own image and its film's poster, and offers Regenerate while the
// podcast episode still stands
test("the open list shows a podcast episode's image and its film's poster, and offers Regenerate", async () => {
	// three podcast episode reports. the first has its own image and a film with one, the second has neither yet, and
	// the third was removed after its report
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return ["podcast-episode-film", "podcast-episode-plain", "podcast-episode-removed"].map((subjectId) =>
				toOpenReportRow({ subjectKind: "podcastEpisode", subjectId }),
			)
		}
		return text.includes('from "episodes"')
			? [
					["podcast-episode-film", "published", "topic-1", "image-hash", "video-image-hash"],
					["podcast-episode-plain", "published", "topic-1", null, null],
					["podcast-episode-removed", "removed", "topic-1", null, null],
				]
			: []
	})
	const openReports = await loadOpenReports()

	// the image's urls and the poster's, and none for the two podcast episodes with no image
	expect(openReports.map((openReport) => openReport.subjectImage)).toEqual([
		toPodcastEpisodeImageUrls("podcast-episode-film", "image-hash"),
		null,
		null,
	])
	expect(openReports.map((openReport) => openReport.topicPodcastEpisodeVideoPosterUrl)).toEqual([
		toTopicPodcastEpisodeVideoPosterUrl("podcast-episode-film", "video-image-hash"),
		null,
		null,
	])

	// a standing podcast episode offers Regenerate even before its image is drawn, and a removed one does not, in one
	// read beside the reports
	expect(openReports.map((openReport) => openReport.canRemove)).toEqual([true, true, false])
	expect(sentQueries).toHaveLength(2)
})

// a Finding and a Topic have nothing for Remove to take down, so their reports offer Clear and Block alone
test.each(["finding", "topic"] as const)("the open list offers no Remove on a %s", async (subjectKind) => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [toOpenReportRow({ subjectKind, subjectId: "subject-1" })] : [],
	)
	const [openReport] = await loadOpenReports()

	// no Remove, an author to block, and no read beside the reports
	expect(openReport?.canRemove).toBe(false)
	expect(openReport?.canAdminBlock).toBe(true)
	expect(sentQueries).toHaveLength(1)
})

// Clear writes the resolution and touches no content
test("keeping a report closes it without a delete", async () => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "noteComment", "c1", null, "the cleared text"]] : [],
	)
	const isResolved = await resolveOpenReport("cleared")
	expect(isResolved).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(updateQuery?.values).toEqual(
		expect.arrayContaining(["cleared", "admin-1", "report-1", toReportTextHash("the cleared text")]),
	)
})

// Block sets the admin block on the author, deletes a removable subject, and closes the report as blocked
test("blocking from a report blocks the author, deletes the comment, and closes the report", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "comment", "comment-1", "author-1"]] : [],
	)
	await resolveOpenReport("blocked")

	// the author's row takes the admin block and the admin who set it
	const blockQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(blockQuery?.values).toContain("admin-1")
	expect(blockQuery?.values).toContain("author-1")
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('delete from "comments"'))).toBe(true)
	expectReportClosed(sentQueries, "blocked")
})

// Block on a Finding puts an admin block on the Topic's owner and deletes nothing
test("blocking from a report of a Finding deletes nothing", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "finding", "finding-1", "owner-1"]] : [],
	)
	await resolveOpenReport("blocked")
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "users"'))).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
})

// a report already resolved, or one that never existed, resolves nothing
test("a missing report is not resolved", async () => {
	stubConnectionPool(() => [])
	const isResolved = await resolveOpenReport("cleared")
	expect(isResolved).toBe(false)
})
