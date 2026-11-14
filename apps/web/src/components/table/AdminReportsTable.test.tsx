// admin reports table tests: a reported avatar shows at its published version with Reset avatar in Remove's place, a
// profile on the initials offers no reset, and a reported podcast episode shows its image and its film's poster with
// Regenerate
import { expect, test } from "bun:test"
import type { AdminReport } from "@carlnotes/contracts/reports"
import { toPodcastEpisodeImageUrls, toTopicPodcastEpisodeVideoPosterUrl } from "@carlnotes/contracts/topicImages"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { AdminReportsTable } from "./AdminReportsTable"

// an open report of a profile on the initials, whose author can be blocked
const PROFILE_REPORT: AdminReport = {
	id: "report-1",
	subjectKind: "profile",
	subjectId: "user-2",
	subjectText: "vienna",
	subjectPath: "/profiles/user-2",
	subjectImage: null,
	subjectAvatarVersion: null,
	topicPodcastEpisodeVideoPosterUrl: null,
	reason: "rude",
	createdAt: "2026-10-29T10:00:00.000Z",
	author: { id: "user-2", username: "vienna" },
	reporter: { id: "user-1", username: "doubleoevan" },
	canRemove: false,
	isSubjectDeleted: false,
	canAdminBlock: true,
}

// the markup of the table's one row, and the labels of the row's buttons in order
async function renderReportRow(report: AdminReport): Promise<{ rowHtml: string; buttonLabels: string[] }> {
	const tableHtml = await renderWithRouter(
		<AdminReportsTable reports={[report]} focusedReportId={null} onResolved={() => {}} />,
	)
	const rowHtml = tableHtml.slice(tableHtml.indexOf("<tbody"), tableHtml.indexOf("</tbody>"))

	// each button's text with its markup stripped
	const buttonLabels = [...rowHtml.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, buttonHtml]) =>
		(buttonHtml ?? "").replace(/<[^>]+>/g, ""),
	)
	return { rowHtml, buttonLabels }
}

// a profile's published avatar is drawn at its own version, with Reset avatar beside Block and Clear
test("a profile with a published avatar shows it and offers Reset avatar", async () => {
	const { rowHtml, buttonLabels } = await renderReportRow({
		...PROFILE_REPORT,
		subjectAvatarVersion: "upload-version",
		canRemove: true,
	})
	expect(rowHtml).toContain('src="/api/avatars/user-2?v=upload-version"')
	expect(buttonLabels).toEqual(["Reset avatar", "Block", "Clear"])
})

// a profile on the initials shows no avatar, and offers Block and Clear alone
test("a profile on the initials shows no avatar and offers no reset", async () => {
	const { rowHtml, buttonLabels } = await renderReportRow(PROFILE_REPORT)
	expect(rowHtml).not.toContain("/api/avatars/")
	expect(buttonLabels).toEqual(["Block", "Clear"])
})

// a team's uploaded avatar is drawn through the team avatar route, with Reset avatar beside Clear
test("a team with an uploaded avatar shows it and offers Reset avatar", async () => {
	const { rowHtml, buttonLabels } = await renderReportRow({
		...PROFILE_REPORT,
		subjectKind: "team",
		subjectId: "team-1",
		subjectText: "River Lab\nReaders of river science.",
		subjectPath: "/teams/team-1",
		subjectAvatarVersion: "team-version",
		author: null,
		canRemove: true,
		canAdminBlock: false,
	})
	expect(rowHtml).toContain('src="/api/team-avatars/team-1?v=team-version"')
	expect(buttonLabels).toEqual(["Reset avatar", "Clear"])
})

// a podcast episode's own image and its film's poster both show, with Regenerate beside Block and Clear
test("a podcast episode shows its image and its film's poster and offers Regenerate", async () => {
	// the podcast episode's image and its film's poster
	const subjectImage = toPodcastEpisodeImageUrls("podcast-episode-1", "image-hash")
	const topicPodcastEpisodeVideoPosterUrl = toTopicPodcastEpisodeVideoPosterUrl("podcast-episode-1", "video-image-hash")
	const { rowHtml, buttonLabels } = await renderReportRow({
		...PROFILE_REPORT,
		subjectKind: "podcastEpisode",
		subjectId: "podcast-episode-1",
		subjectText: "Agents that read the docs",
		subjectPath: "/topics/topic-1/llm-tooling/episodes/2026/12",
		subjectImage,
		topicPodcastEpisodeVideoPosterUrl,
		canRemove: true,
	})

	// both images at the list size, and Regenerate in Remove's place
	expect(rowHtml).toContain(`src="${subjectImage.list.url}"`)
	expect(rowHtml).toContain(`src="${topicPodcastEpisodeVideoPosterUrl}"`)
	expect(buttonLabels).toEqual(["Regenerate", "Block", "Clear"])
})

// a podcast episode removed after its report has no image to draw again, so it offers Block and Clear alone
test("a removed podcast episode offers no Regenerate", async () => {
	const { rowHtml, buttonLabels } = await renderReportRow({ ...PROFILE_REPORT, subjectKind: "podcastEpisode" })
	expect(rowHtml).not.toContain("<img")
	expect(buttonLabels).toEqual(["Block", "Clear"])
})
