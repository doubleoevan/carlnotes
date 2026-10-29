// the admin console's open reports: each report's text and people, the linked report first, and Remove or Keep
import { sendReportResolution } from "@carlnotes/client/reportClient"
import type { AdminReport } from "@carlnotes/contracts/reports"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { AdminReportsTable } from "./AdminReportsTable"

// a message, a note comment already deleted by its author, and a public topic, each reported by a different person
const ADMIN_REPORT_FIXTURES: AdminReport[] = [
	{
		id: "report-message",
		subjectKind: "chatMessage",
		subjectId: "12",
		subjectText: "Nobody asked you, and nobody will.",
		subjectPath: "/topics/topic-llm-tooling/chat",
		reason: "Hostile toward another member.",
		createdAt: FIXTURE_DATE.toISOString(),
		author: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		reporter: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		canRemove: true,
		isSubjectDeleted: false,
	},
	{
		id: "report-comment",
		subjectKind: "noteComment",
		subjectId: "comment-3",
		subjectText: "Dropped it. Have a look.",
		subjectPath: "/topics/topic-llm-tooling/notes/note-eval-checklist",
		reason: "Spam link in the comment.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
		author: { id: STORY_PEOPLE[2].userId, username: STORY_PEOPLE[2].username },
		reporter: { id: STORY_PEOPLE[0].userId, username: STORY_PEOPLE[0].username },
		canRemove: true,
		isSubjectDeleted: true,
	},
	{
		id: "report-topic",
		subjectKind: "topic",
		subjectId: "topic-llm-tooling",
		subjectText: "LLM tooling",
		subjectPath: "/topics/topic-llm-tooling",
		reason: "The description copies a paywalled article word for word.",
		createdAt: new Date(FIXTURE_DATE.getTime() - 2 * 86_400_000).toISOString(),
		author: null,
		reporter: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
		canRemove: false,
		isSubjectDeleted: false,
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

// three open reports, newest first. the deleted comment shows no Remove, and the topic cannot be removed from here
export const Default: Story = {}

// the report the email linked to, sorted first and highlighted
export const Focused: Story = { args: { focusedReportId: "report-topic" } }

// Keep closes the report and reloads the list
export const Kept: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Keep" })[0] as HTMLElement)
		await waitFor(() => expect(mocked(sendReportResolution)).toHaveBeenCalledWith("report-message", "kept"))
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
		const page = canvasElement.ownerDocument.body
		await waitFor(() => expect(page.textContent).toContain(SAVE_FAILED_TEXT))
	},
}

// no open reports
export const Empty: Story = { args: { reports: [] } }
