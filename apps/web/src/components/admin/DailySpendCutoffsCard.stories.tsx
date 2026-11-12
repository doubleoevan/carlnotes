// the admin console's spend control section: below every cutoff with every default, past two with overrides and a busy
// hour of signups, the cutoffs saved and reset from their buttons, a setting saved on blur without the typed cutoffs,
// unverified signups limited, a save that failed, and a rejected value
import { sendSpendControlSettings } from "@carlnotes/client/billingClient"
import type { AdminDailySpendCutoffs } from "@carlnotes/contracts/admin"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { DailySpendCutoffsCard } from "./DailySpendCutoffsCard"

// a day of 12 dollars of free-plan spend, below every cutoff, with every setting at its default
const BELOW_CUTOFFS: AdminDailySpendCutoffs = {
	freePlanSpendCents: 1_200,
	worstCaseMonthlySpend: {
		freeUserBudgetCents: 93_600,
		dailySignupCounts: Array.from({ length: 30 }, (_, daysAgo) => (daysAgo % 7 === 2 ? 4 : daysAgo % 3 === 0 ? 1 : 0)),
	},
	cutoffs: [
		{ kind: "podcastEpisodes", value: 6_500, defaultValue: 6_500, isOverridden: false, isPassed: false },
		{ kind: "scheduledScans", value: 10_000, defaultValue: 10_000, isOverridden: false, isPassed: false },
		{ kind: "chat", value: 15_000, defaultValue: 15_000, isOverridden: false, isPassed: false },
	],
	firstScanDispatchLimit: { value: 5, defaultValue: 5, isOverridden: false },
	waitingScanCount: 0,
	hourlySignupAlertCount: { value: 50, defaultValue: 50, isOverridden: false },
	hourlySignupCount: 12,
	isUnverifiedFirstScanLimitOn: false,
	updatedAt: null,
	updatedByUsername: null,
}

// a day of 140 dollars past the podcast episodes cutoff and a lowered scheduled scans cutoff, under the chat cutoff,
// a first scan limit of 2 with 12 scans waiting, 64 signups in the hour, and unverified signups limited
const PAST_CUTOFFS: AdminDailySpendCutoffs = {
	freePlanSpendCents: 14_000,
	worstCaseMonthlySpend: {
		freeUserBudgetCents: 331_500,
		dailySignupCounts: Array.from({ length: 30 }, (_, daysAgo) => (daysAgo === 0 ? 900 : daysAgo < 3 ? 120 : 15)),
	},
	cutoffs: [
		{ kind: "podcastEpisodes", value: 6_500, defaultValue: 6_500, isOverridden: false, isPassed: true },
		{ kind: "scheduledScans", value: 8_000, defaultValue: 10_000, isOverridden: true, isPassed: true },
		{ kind: "chat", value: 15_000, defaultValue: 15_000, isOverridden: false, isPassed: false },
	],
	firstScanDispatchLimit: { value: 2, defaultValue: 5, isOverridden: true },
	waitingScanCount: 12,
	hourlySignupAlertCount: { value: 50, defaultValue: 50, isOverridden: false },
	hourlySignupCount: 64,
	isUnverifiedFirstScanLimitOn: true,
	updatedAt: FIXTURE_DATE.toISOString(),
	updatedByUsername: STORY_PEOPLE[0].username,
}

const meta = {
	title: "Admin/DailySpendCutoffsCard",
	component: DailySpendCutoffsCard,
	args: { dailySpendCutoffs: BELOW_CUTOFFS, onSaved: fn() },
	argTypes: { dailySpendCutoffs: { control: false }, onSaved: { control: false } },
	parameters: { session: "admin" },
	// a save succeeds unless a story says otherwise
	beforeEach: () => {
		mocked(sendSpendControlSettings).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof DailySpendCutoffsCard>

export default meta
type Story = StoryObj<typeof meta>

// below every cutoff, with every setting at its default
export const Default: Story = {}

// past two cutoffs, with overrides, scans waiting, and signups past the alert
export const PastCutoffs: Story = { args: { dailySpendCutoffs: PAST_CUTOFFS } }

// typing a cutoff and pressing Save daily cutoffs sends it in dollars, with null for each empty field, and reloads the
// console
export const Saved: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.type(canvas.getByLabelText("Scheduled scans cutoff"), "80")
		await userEvent.tab()
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
		await userEvent.click(canvas.getByRole("button", { name: "Save daily cutoffs" }))
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({
				podcastEpisodesCutoffDollars: null,
				scheduledScansCutoffDollars: 80,
				chatCutoffDollars: null,
				firstScanDispatchLimit: null,
				hourlySignupAlertCount: null,
				isUnverifiedFirstScanLimitOn: false,
			}),
		)
		await waitFor(() => expect(args.onSaved).toHaveBeenCalled())
	},
}

// Reset puts back the saved cutoffs without sending anything
export const CutoffsReset: Story = {
	play: async ({ canvas, userEvent }) => {
		const cutoffInput = canvas.getByLabelText("Podcast episodes cutoff")
		await userEvent.type(cutoffInput, "40")
		await expect(canvas.getByRole("button", { name: "Save daily cutoffs" })).toBeEnabled()
		await userEvent.click(canvas.getByRole("button", { name: "Reset" }))
		await expect(cutoffInput).toHaveValue(null)
		await expect(canvas.getByRole("button", { name: "Save daily cutoffs" })).toBeDisabled()
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
	},
}

// Defaults empties every overridden cutoff, and Save daily cutoffs then sends each as null
export const CutoffsDefaulted: Story = {
	args: { dailySpendCutoffs: PAST_CUTOFFS },
	play: async ({ canvas, userEvent }) => {
		const defaultsButton = canvas.getByRole("button", { name: "Defaults" })
		await expect(defaultsButton).toBeEnabled()
		await userEvent.click(defaultsButton)

		// every cutoff field shows its default and the defaults button goes idle without sending anything
		await expect(canvas.getByLabelText("Podcast episodes cutoff")).toHaveValue(null)
		await expect(canvas.getByLabelText("Scheduled scans cutoff")).toHaveValue(null)
		await expect(defaultsButton).toBeDisabled()
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()

		// saving sends the defaults as null overrides
		await userEvent.click(canvas.getByRole("button", { name: "Save daily cutoffs" }))
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith(
				expect.objectContaining({
					podcastEpisodesCutoffDollars: null,
					scheduledScansCutoffDollars: null,
					chatCutoffDollars: null,
				}),
			),
		)
	},
}

// a first scan limit saved on blur sends the saved cutoffs, never a typed one
export const SettingSavedWithoutCutoffs: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Podcast episodes cutoff"), "40")
		await userEvent.type(canvas.getByLabelText("First scan limit"), "3")
		await userEvent.tab()
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith(
				expect.objectContaining({ podcastEpisodesCutoffDollars: null, firstScanDispatchLimit: 3 }),
			),
		)
	},
}

// turning off the permission for unverified signups to scan saves their first scan limit as on
export const UnverifiedSignupsLimited: Story = {
	play: async ({ canvas, userEvent }) => {
		const permissionSwitch = canvas.getByRole("switch", { name: "Allow unverified email sign-ups to scan" })
		await expect(permissionSwitch).toBeChecked()
		await userEvent.click(permissionSwitch)
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith(
				expect.objectContaining({ isUnverifiedFirstScanLimitOn: true }),
			),
		)
	},
}

// a save that did not reach the api says so
export const SaveFailed: Story = {
	beforeEach: () => {
		mocked(sendSpendControlSettings).mockRejectedValue(new Error("offline"))
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Podcast episodes cutoff"), "40")
		await userEvent.click(canvas.getByRole("button", { name: "Save daily cutoffs" }))
		const documentBody = canvasElement.ownerDocument.body
		await waitFor(() => expect(documentBody.textContent).toContain("Spend control settings didn't save."))
	},
}

// a first scan limit below zero is not sent
export const Rejected: Story = {
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("First scan limit"), "-1")
		await userEvent.tab()
		const documentBody = canvasElement.ownerDocument.body
		await waitFor(() => expect(documentBody.textContent).toContain("the first scan limit 0 or more"))
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
	},
}
