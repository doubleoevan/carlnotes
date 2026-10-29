// the report dialog: the user's reason for flagging a Topic, a profile, a Team, a chat message, a note, or a note
// comment, sent to the moderators, with the author's block offered on an authored subject
import { sendFlagContent } from "@carlnotes/client/flagContentClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, screen, spyOn, waitFor } from "storybook/test"
import { STORY_PEOPLE } from "../../../.storybook/fixtures"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import type { StoryPlayContext } from "../../../.storybook/play"
import { ReportIssueDialog } from "./ReportIssueDialog"

// the reason a story types into the dialog
const REPORT_REASON = "The topic description copies a paywalled article word for word."

// type the reason into the textarea, which the dialog focuses as it opens. typing from the keyboard skips the click,
// which fails while radix still has pointer events off on the body
async function typeReportReason({ userEvent }: StoryPlayContext<Story>): Promise<void> {
	const reasonTextarea = await screen.findByRole("textbox", { name: "Why you are reporting this" })
	await waitFor(() => expect(reasonTextarea).toHaveFocus())
	await userEvent.keyboard(REPORT_REASON)
}

const meta = {
	title: "Common/ReportIssueDialog",
	component: ReportIssueDialog,
	args: { subjectKind: "topic", subjectId: "topic-llm-tooling", subjectLabel: "LLM tooling", onClose: fn() },
	argTypes: {
		subjectKind: {
			control: "inline-radio",
			options: ["topic", "profile", "team", "chatMessage", "note", "noteComment"],
		},
		subjectId: { control: "text" },
		subjectLabel: { control: "text" },
		onClose: { control: false },
	},
	// each dialog covers its own frame on the docs page
	parameters: { docs: toOwnFrameDocs(420) },
	// a send succeeds unless a story says otherwise
	beforeEach: () => {
		mocked(sendFlagContent).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof ReportIssueDialog>

export default meta
type Story = StoryObj<typeof meta>

// a Topic's report with no reason yet, which can be sent as it is
export const Topic: Story = {}

// a profile's report
export const Profile: Story = {
	args: { subjectKind: "profile", subjectId: STORY_PEOPLE[1].userId, subjectLabel: STORY_PEOPLE[1].username },
}

// a Team's report with a long name, which wraps in the title
export const LongTeamName: Story = {
	args: {
		subjectKind: "team",
		subjectId: "team-reading-club",
		subjectLabel: "The Thursday evening reading club for LLM tooling and design systems",
	},
}

// a typed reason
export const WithReason: Story = { play: typeReportReason }

// a chat message's report, with the author's block switched on before the send
export const WithAuthorBlock: Story = {
	args: {
		subjectKind: "chatMessage",
		subjectId: "chat-message-12",
		subjectLabel: "a message from carlos",
		author: { id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username },
	},
	play: async (context) => {
		await typeReportReason(context)
		await context.userEvent.click(screen.getByRole("switch", { name: "Block @carlos" }))
		await context.userEvent.click(screen.getByRole("button", { name: "Send report" }))
		await waitFor(() =>
			expect(mocked(sendFlagContent)).toHaveBeenCalledWith(expect.objectContaining({ shouldBlockAuthor: true })),
		)
	},
}

// the send in progress, with the button showing its progress
export const Sending: Story = {
	beforeEach: () => {
		mocked(sendFlagContent).mockImplementation(() => new Promise(() => {}))
	},
	play: async (context) => {
		await typeReportReason(context)
		await context.userEvent.click(screen.getByRole("button", { name: "Send report" }))
		await expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled()
	},
}

// a rejected send, which keeps the dialog open and shows the api's reason in a toast
export const Rejected: Story = {
	beforeEach: () => {
		mocked(sendFlagContent).mockRejectedValue(new Error("You already reported this topic."))

		// the dialog logs the rejected send this story expects, so only that log is kept out of the console
		const logError = console.error
		const consoleErrorSpy = spyOn(console, "error").mockImplementation((...messages) => {
			if (messages[0] !== "flag failed") {
				logError(...messages)
			}
		})
		return () => consoleErrorSpy.mockRestore()
	},
	play: async (context) => {
		await typeReportReason(context)
		await context.userEvent.click(screen.getByRole("button", { name: "Send report" }))
		await expect(await screen.findByText("You already reported this topic.")).toBeInTheDocument()
	},
}
