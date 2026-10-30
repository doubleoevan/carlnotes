// the admin console's mobile app section: both minimums set, none set, a save, a save that failed, and a rejected version
import { sendMobileMinimumVersion } from "@carlnotes/client/billingClient"
import type { MobileMinimumVersionRow } from "@carlnotes/contracts/admin"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { MobileMinimumVersionsCard } from "./MobileMinimumVersionsCard"

// an ios minimum saved by a person and an android minimum saved by an account since closed
const MINIMUM_VERSION_FIXTURES: MobileMinimumVersionRow[] = [
	{
		platform: "ios",
		minimumVersion: "1.2.0",
		updatedAt: FIXTURE_DATE.toISOString(),
		updatedByUsername: STORY_PEOPLE[0].username,
	},
	{
		platform: "android",
		minimumVersion: "1.1.0",
		updatedAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
		updatedByUsername: null,
	},
]

const meta = {
	title: "Admin/MobileMinimumVersionsCard",
	component: MobileMinimumVersionsCard,
	args: { minimumVersions: MINIMUM_VERSION_FIXTURES, onSaved: fn() },
	argTypes: { minimumVersions: { control: false }, onSaved: { control: false } },
	parameters: { session: "admin" },
	// a save succeeds unless a story says otherwise
	beforeEach: () => {
		mocked(sendMobileMinimumVersion).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof MobileMinimumVersionsCard>

export default meta
type Story = StoryObj<typeof meta>

// both platforms have a minimum, one saved by a closed account
export const Default: Story = {}

// no minimum on either platform
export const Empty: Story = { args: { minimumVersions: [] } }

// typing a version and saving sends it and reloads the console
export const Saved: Story = {
	args: { minimumVersions: [] },
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.type(canvas.getByLabelText("iOS minimum version"), "1.3.0")
		await userEvent.click(canvas.getAllByRole("button", { name: "Save" })[0] as HTMLElement)
		await waitFor(() => expect(mocked(sendMobileMinimumVersion)).toHaveBeenCalledWith("ios", "1.3.0"))
		await waitFor(() => expect(args.onSaved).toHaveBeenCalled())
	},
}

// a save that did not reach the api says so and keeps the input
export const SaveFailed: Story = {
	beforeEach: () => {
		mocked(sendMobileMinimumVersion).mockRejectedValue(new Error("offline"))
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Save" })[0] as HTMLElement)
		const documentBody = canvasElement.ownerDocument.body
		await waitFor(() => expect(documentBody.textContent).toContain("iOS minimum didn't save."))
	},
}

// a version that is not dotted integers is not sent
export const Rejected: Story = {
	args: { minimumVersions: [] },
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Android minimum version"), "soon")
		await userEvent.click(canvas.getAllByRole("button", { name: "Save" })[1] as HTMLElement)
		const documentBody = canvasElement.ownerDocument.body
		await waitFor(() => expect(documentBody.textContent).toContain("Android minimum must be a version like 1.2.0."))
		expect(mocked(sendMobileMinimumVersion)).not.toHaveBeenCalled()
	},
}
