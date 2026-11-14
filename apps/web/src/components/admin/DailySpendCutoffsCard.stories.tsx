// the admin console's spend control section: below every cutoff with every default, past two with overrides and a busy
// hour of signups, the cutoffs saved and reset from their buttons, a setting saved on blur without the typed cutoffs,
// unverified signups limited, every switch on, each pause and the pinned-only home saved as it is flipped, a saved
// pause left out of the next save and sent once it is turned back off, the generated image limit saved on blur, a
// save that failed, and a rejected value
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
	generatedChapterImageLimit: { value: 40, defaultValue: 40, isOverridden: false },
	isUnverifiedFirstScanLimitOn: false,
	isPodcastEpisodeRecordingPaused: false,
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
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
	generatedChapterImageLimit: { value: 40, defaultValue: 40, isOverridden: false },
	isUnverifiedFirstScanLimitOn: true,
	isPodcastEpisodeRecordingPaused: false,
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
	updatedAt: FIXTURE_DATE.toISOString(),
	updatedByUsername: STORY_PEOPLE[0].username,
}

// both pauses and the pinned-only home on, unverified signups limited, and a generated image limit of 10
const EVERY_SWITCH_ON: AdminDailySpendCutoffs = {
	...BELOW_CUTOFFS,
	generatedChapterImageLimit: { value: 10, defaultValue: 40, isOverridden: true },
	isUnverifiedFirstScanLimitOn: true,
	isPodcastEpisodeRecordingPaused: true,
	isTopicPodcastEpisodeVideoRenderingPaused: true,
	isHomePinnedOnly: true,
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

// typing a cutoff and pressing Save daily cutoffs sends that cutoff alone, in dollars, and reloads the console
export const Saved: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.type(canvas.getByLabelText("Scheduled scans cutoff"), "80")
		await userEvent.tab()
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
		await userEvent.click(canvas.getByRole("button", { name: "Save daily cutoffs" }))
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ scheduledScansCutoffDollars: 80 }),
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

// Defaults empties every overridden cutoff, and Save daily cutoffs then sends the one overridden cutoff as null
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

		// saving sends the scheduled scans cutoff as a null override, and no cutoff that already read its default
		await userEvent.click(canvas.getByRole("button", { name: "Save daily cutoffs" }))
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ scheduledScansCutoffDollars: null }),
		)
	},
}

// a first scan limit saved on blur sends the limit alone, never a typed cutoff, so every other setting keeps its
// stored value
export const SettingSavedWithoutCutoffs: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Podcast episodes cutoff"), "40")
		await userEvent.type(canvas.getByLabelText("First scan limit"), "3")
		await userEvent.tab()
		await waitFor(() => expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ firstScanDispatchLimit: 3 }))
	},
}

// turning off the permission for unverified signups to scan and chat saves their limit as on
export const UnverifiedSignupsLimited: Story = {
	play: async ({ canvas, userEvent }) => {
		const permissionSwitch = canvas.getByRole("switch", { name: "Allow unverified email sign-ups to scan and chat" })
		await expect(permissionSwitch).toBeChecked()
		await userEvent.click(permissionSwitch)
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ isUnverifiedFirstScanLimitOn: true }),
		)
	},
}

// every switch on: both pauses, the pinned-only home, unverified signups limited, and an overridden image limit
export const EverySwitchOn: Story = {
	args: { dailySpendCutoffs: EVERY_SWITCH_ON },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("switch", { name: "Pause new podcast episodes" })).toBeChecked()
		await expect(canvas.getByRole("switch", { name: "Pause new films" })).toBeChecked()
		await expect(canvas.getByRole("switch", { name: "Show only pinned items on the home" })).toBeChecked()
		await expect(
			canvas.getByRole("switch", { name: "Allow unverified email sign-ups to scan and chat" }),
		).not.toBeChecked()
		await expect(canvas.getByLabelText("Generated image limit")).toHaveValue(10)
	},
}

// flipping the pause on new podcast episodes saves it as on, and sends no other setting
export const PodcastEpisodesPaused: Story = {
	play: async ({ canvas, userEvent }) => {
		const pauseSwitch = canvas.getByRole("switch", { name: "Pause new podcast episodes" })
		await expect(pauseSwitch).not.toBeChecked()
		await userEvent.click(pauseSwitch)
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ isPodcastEpisodeRecordingPaused: true }),
		)
	},
}

// each save becomes what the tab holds as saved. a saved pause is left out of the save after it, and turning the
// pause back off sends the pause alone
export const SavedPauseTurnedOff: Story = {
	play: async ({ canvas, userEvent }) => {
		// pause new podcast episodes, and wait for its save
		const pauseSwitch = canvas.getByRole("switch", { name: "Pause new podcast episodes" })
		await userEvent.click(pauseSwitch)
		await waitFor(() => expect(mocked(sendSpendControlSettings)).toHaveBeenCalledTimes(1))

		// a signup alert saved next sends no pause
		await userEvent.type(canvas.getByLabelText("Hourly signup alert"), "80")
		await userEvent.tab()
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenLastCalledWith({ hourlySignupAlertCount: 80 }),
		)

		// turning the pause back off sends it, without the signup alert the tab already saved
		await userEvent.click(pauseSwitch)
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenLastCalledWith({ isPodcastEpisodeRecordingPaused: false }),
		)

		// the image limit field that lost focus unchanged sent nothing
		expect(mocked(sendSpendControlSettings)).toHaveBeenCalledTimes(3)
	},
}

// flipping the pause on new films saves it as on
export const TopicPodcastEpisodeVideosPaused: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("switch", { name: "Pause new films" }))
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({
				isTopicPodcastEpisodeVideoRenderingPaused: true,
			}),
		)
	},
}

// flipping the pinned-only home saves it as on
export const HomePinnedOnly: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("switch", { name: "Show only pinned items on the home" }))
		await waitFor(() => expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ isHomePinnedOnly: true }))
	},
}

// a generated image limit typed and left saves on blur, and its default shows as the placeholder
export const ImageLimitSaved: Story = {
	play: async ({ canvas, userEvent }) => {
		const imageLimitInput = canvas.getByLabelText("Generated image limit")
		await expect(imageLimitInput).toHaveAttribute("placeholder", "40")
		await userEvent.type(imageLimitInput, "10")
		await userEvent.tab()
		await waitFor(() =>
			expect(mocked(sendSpendControlSettings)).toHaveBeenCalledWith({ generatedChapterImageLimit: 10 }),
		)
	},
}

// a generated image limit below zero is not sent
export const ImageLimitRejected: Story = {
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Generated image limit"), "-1")
		await userEvent.tab()
		const documentBody = canvasElement.ownerDocument.body
		await waitFor(() => expect(documentBody.textContent).toContain("the generated image limit 0 to 1,000"))
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
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
		await waitFor(() => expect(documentBody.textContent).toContain("the first scan limit 0 to 10,000"))
		expect(mocked(sendSpendControlSettings)).not.toHaveBeenCalled()
	},
}
