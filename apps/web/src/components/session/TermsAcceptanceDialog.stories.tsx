// the Terms acceptance dialog a stale account sees: accept, put it off with Not now, or a failed acceptance
import { sendTermsAcceptance } from "@carlnotes/client/termsClient"
import { TERMS_VERSION } from "@carlnotes/contracts/terms"
import { clearTermsAcceptanceRequest, requestTermsAcceptance } from "@carlnotes/core/stores/termsAcceptanceStore"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, screen, waitFor } from "storybook/test"
import { FIXTURE_DATE } from "../../../.storybook/fixtures"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { TermsAcceptanceDialog } from "./TermsAcceptanceDialog"

const meta = {
	title: "Session/TermsAcceptanceDialog",
	component: TermsAcceptanceDialog,
	parameters: { session: "user", docs: toOwnFrameDocs(420) },
	// a write rejected for the Terms opens the dialog, and the acceptance records unless a story says otherwise
	beforeEach: () => {
		requestTermsAcceptance()
		mocked(sendTermsAcceptance).mockResolvedValue({
			termsVersion: TERMS_VERSION,
			termsAcceptedAt: FIXTURE_DATE.toISOString(),
		})
		return clearTermsAcceptanceRequest
	},
} satisfies Meta<typeof TermsAcceptanceDialog>

export default meta
type Story = StoryObj<typeof meta>

// the dialog with the Terms and Privacy linked and the version named
export const Default: Story = {}

// accepting records the version and closes the dialog
export const Accepted: Story = {
	play: async ({ userEvent }) => {
		await userEvent.click(await screen.findByRole("button", { name: "Accept the Terms" }))
		await waitFor(() => expect(mocked(sendTermsAcceptance)).toHaveBeenCalled())
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
	},
}

// Not now closes the dialog and records nothing. the next rejected write opens it again
export const Dismissed: Story = {
	play: async ({ userEvent }) => {
		await userEvent.click(await screen.findByRole("button", { name: "Not now" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
		await expect(mocked(sendTermsAcceptance)).not.toHaveBeenCalled()
	},
}

// a failed acceptance keeps the dialog open and says so, with Not now still there
export const AcceptFailed: Story = {
	beforeEach: () => {
		mocked(sendTermsAcceptance).mockRejectedValue(new Error("offline"))
	},
	play: async ({ userEvent }) => {
		await userEvent.click(await screen.findByRole("button", { name: "Accept the Terms" }))
		await expect(await screen.findByText(/try again/i)).toBeVisible()
		await expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled()
	},
}
