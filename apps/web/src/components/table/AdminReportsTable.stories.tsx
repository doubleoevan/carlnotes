// the admin console's open reports: each report's text and people, the linked report first, and Remove, Block, or
// Clear, with Reset avatar on a reported avatar and Regenerate on a reported podcast episode
import { sendReportResolution } from "@carlnotes/client/reportClient"
import type { AdminReport } from "@carlnotes/contracts/reports"
import { toProfilePath, toTeamPath } from "@carlnotes/contracts/seo"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, screen, waitFor, within } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { SAMPLE_TOPIC_IMAGE } from "../../../.storybook/fixtures/topics"
import { AdminReportsTable } from "./AdminReportsTable"

// what a report shows of a subject with no image, no avatar, and no film poster
const NO_SUBJECT_IMAGES = { subjectImage: null, subjectAvatarVersion: null, topicPodcastEpisodeVideoPosterUrl: null }

// a chat room message, a note comment already deleted by its author, a public topic, and a topic's image, each
// reported by a different person
const ADMIN_REPORT_FIXTURES: AdminReport[] = [
	{
		id: "report-message",
		subjectKind: "chatMessage",
		subjectId: "12",
		subjectText: "Nobody asked you, and nobody will.",
		subjectPath: "/topics/topic-llm-tooling/chat",
		...NO_SUBJECT_IMAGES,
		reason: "Hostile toward another member.",
		createdAt: FIXTURE_DATE.toISOString(),
		author: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		reporter: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
	{
		id: "report-comment",
		subjectKind: "noteComment",
		subjectId: "comment-3",
		subjectText: "Dropped it. Have a look.",
		subjectPath: "/topics/topic-llm-tooling/notes/note-eval-checklist",
		...NO_SUBJECT_IMAGES,
		reason: "Spam link in the comment.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
		author: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		reporter: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		canRemove: true,
		isSubjectDeleted: true,
		canAdminBlock: true,
	},
	{
		id: "report-topic",
		subjectKind: "topic",
		subjectId: "topic-llm-tooling",
		subjectText: "LLM tooling",
		subjectPath: "/topics/topic-llm-tooling",
		...NO_SUBJECT_IMAGES,
		reason: "The description copies a paywalled article word for word.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 2 * 86_400_000).toISOString(),
		author: null,
		reporter: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		canRemove: false,
		isSubjectDeleted: false,
		canAdminBlock: false,
	},
	{
		id: "report-topic-image",
		subjectKind: "topicImage",
		subjectId: "topic-llm-tooling",
		subjectText: "LLM tooling",
		subjectPath: "/topics/topic-llm-tooling",
		...NO_SUBJECT_IMAGES,
		subjectImage: SAMPLE_TOPIC_IMAGE,
		reason: "The image shows a real person.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 3 * 86_400_000).toISOString(),
		author: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		reporter: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
]

// a profile with an uploaded avatar, a team with one, and a profile on the initials, which has no avatar to reset
const AVATAR_REPORT_FIXTURES: AdminReport[] = [
	{
		id: "report-profile-avatar",
		subjectKind: "profile",
		subjectId: STORY_PEOPLE[1].userId,
		subjectText: STORY_PEOPLE[1].username,
		subjectPath: toProfilePath(STORY_PEOPLE[1].userId),
		...NO_SUBJECT_IMAGES,
		subjectAvatarVersion: "avatar-upload",
		reason: "The avatar is a photo of someone else.",
		createdAt: FIXTURE_DATE.toISOString(),
		author: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		reporter: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
	{
		id: "report-team-avatar",
		subjectKind: "team",
		subjectId: STORY_TEAMS.designGuild.teamId,
		subjectText: `${STORY_TEAMS.designGuild.name}\n${STORY_TEAMS.designGuild.description}`,
		subjectPath: toTeamPath(STORY_TEAMS.designGuild.teamId),
		...NO_SUBJECT_IMAGES,
		subjectAvatarVersion: "team-avatar-upload",
		reason: "The team's avatar is another company's logo.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
		author: null,
		reporter: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: false,
	},
	{
		id: "report-profile-initials",
		subjectKind: "profile",
		subjectId: STORY_PEOPLE[2].userId,
		subjectText: STORY_PEOPLE[2].username,
		subjectPath: toProfilePath(STORY_PEOPLE[2].userId),
		...NO_SUBJECT_IMAGES,
		reason: "The username copies a brand.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 2 * 86_400_000).toISOString(),
		author: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		reporter: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		canRemove: false,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
]

// a podcast episode with its own image and its film's poster, and a podcast episode removed after its report, which
// has no image to draw again
const PODCAST_EPISODE_REPORT_FIXTURES: AdminReport[] = [
	{
		id: "report-podcast-episode",
		subjectKind: "podcastEpisode",
		subjectId: "podcast-episode-12",
		subjectText: "Agents that read the docs",
		subjectPath: "/topics/topic-llm-tooling/llm-tooling/episodes/2026/12",
		...NO_SUBJECT_IMAGES,
		subjectImage: SAMPLE_TOPIC_IMAGE,
		topicPodcastEpisodeVideoPosterUrl: SAMPLE_TOPIC_IMAGE.page.url,
		reason: "The image shows a real person.",
		createdAt: FIXTURE_DATE.toISOString(),
		author: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		reporter: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
	{
		id: "report-removed-podcast-episode",
		subjectKind: "podcastEpisode",
		subjectId: "podcast-episode-10",
		subjectText: "Small models, sharp evals",
		subjectPath: "/topics/topic-llm-tooling/llm-tooling/episodes/2026/10",
		...NO_SUBJECT_IMAGES,
		reason: "The description is misleading.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
		author: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		reporter: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		canRemove: false,
		isSubjectDeleted: false,
		canAdminBlock: true,
	},
]

const meta = {
	title: "Table/AdminReportsTable",
	component: AdminReportsTable,
	args: { reports: ADMIN_REPORT_FIXTURES, focusedReportId: null, onResolved: fn() },
	argTypes: { reports: { control: false }, onResolved: { control: false } },
	parameters: { session: "admin" },
	// a resolution saves unless a story says otherwise
	beforeEach: () => {
		mocked(sendReportResolution).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof AdminReportsTable>

export default meta
type Story = StoryObj<typeof meta>

// four open reports, newest first. the deleted comment shows no Remove, the topic, which has no author, shows neither
// Remove nor Block, and the topic's image shows Regenerate in Remove's place
export const Default: Story = {}

// the report the email linked to, sorted first and highlighted
export const Focused: Story = { args: { focusedReportId: "report-topic" } }

// Clear asks first, then closes the report and reloads the list
export const ClearReportedContent: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Clear" })[0] as HTMLElement)
		await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Clear" }))
		await waitFor(() => expect(mocked(sendReportResolution)).toHaveBeenCalledWith("report-message", "cleared"))
		await waitFor(() => expect(args.onResolved).toHaveBeenCalled())
	},
}

// Block asks first, then resolves the report by blocking its author from reactions and comments
export const Blocked: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Block" })[0] as HTMLElement)
		await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Block" }))
		await waitFor(() => expect(mocked(sendReportResolution)).toHaveBeenCalledWith("report-message", "blocked"))
		await waitFor(() => expect(args.onResolved).toHaveBeenCalled())
	},
}

// a resolution that did not save keeps the row and says so
export const SaveFailed: Story = {
	beforeEach: () => {
		mocked(sendReportResolution).mockRejectedValue(new Error("offline"))
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Remove" })[0] as HTMLElement)
		await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }))
		const page = canvasElement.ownerDocument.body
		await waitFor(() => expect(page.textContent).toContain(SAVE_FAILED_TEXT))
	},
}

// a profile's and a team's uploaded avatar, each shown in its row with Reset avatar in Remove's place, and a profile on
// the initials with Block and Clear alone. the component browser serves no avatar file, so each avatar shows its
// initials here
export const ReportedAvatars: Story = { args: { reports: AVATAR_REPORT_FIXTURES } }

// Reset avatar asks first, then resolves the report as removed. the profile on the initials offers no reset
export const ResetAvatar: Story = {
	args: { reports: AVATAR_REPORT_FIXTURES },
	play: async ({ canvas, userEvent, args }) => {
		// the profile's and the team's avatar each offer the reset, and the profile on the initials does not
		const resetAvatarButtons = canvas.getAllByRole("button", { name: "Reset avatar" })
		await expect(resetAvatarButtons).toHaveLength(2)

		// confirm the profile's reset
		await userEvent.click(resetAvatarButtons[0] as HTMLElement)
		await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reset avatar" }))
		await waitFor(() => expect(mocked(sendReportResolution)).toHaveBeenCalledWith("report-profile-avatar", "removed"))
		await waitFor(() => expect(args.onResolved).toHaveBeenCalled())
	},
}

// a podcast episode's own image beside its film's poster, with Regenerate in Remove's place, and a podcast episode
// removed after its report with Block and Clear alone
export const ReportedPodcastEpisode: Story = { args: { reports: PODCAST_EPISODE_REPORT_FIXTURES } }

// Regenerate asks first, naming the film's uploaded image too, then resolves the report as removed
export const RegeneratePodcastEpisodeImage: Story = {
	args: { reports: PODCAST_EPISODE_REPORT_FIXTURES },
	play: async ({ canvas, userEvent, args }) => {
		// the one podcast episode that still stands offers Regenerate, and its confirmation names the film's image
		await userEvent.click(canvas.getByRole("button", { name: "Regenerate" }))
		const confirmDialog = within(await screen.findByRole("dialog"))
		const topicPodcastEpisodeVideoSentence = confirmDialog.getByText(
			/The film's image is drawn again too if it was uploaded\./,
		)
		await waitFor(() => expect(topicPodcastEpisodeVideoSentence).toBeVisible())

		// confirm the regeneration
		await userEvent.click(confirmDialog.getByRole("button", { name: "Regenerate" }))
		await waitFor(() => expect(mocked(sendReportResolution)).toHaveBeenCalledWith("report-podcast-episode", "removed"))
		await waitFor(() => expect(args.onResolved).toHaveBeenCalled())
	},
}

// no open reports
export const Empty: Story = { args: { reports: [] } }
