import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { SpendMeter } from "./SpendMeter"

// match the native budget stories with the same cutoff and spend fixtures
const meta = {
	title: "Account/SpendMeter",
	component: SpendMeter,
	args: {
		scanSpendCents: 10,
		chatSpendCents: 0,
		podcastEpisodeSpendCents: 0,
		budgetCents: 300,
		monthlyBudgetCutoffs: [
			{ kind: "spokenQuestions", budgetShare: 0.15 },
			{ kind: "podcastEpisodes", budgetShare: 0.2 },
			{ kind: "dailyScans", budgetShare: 0.58 },
			{ kind: "manualScans", budgetShare: 0.9 },
		],
	},
} satisfies Meta<typeof SpendMeter>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PassedCheckpoints: Story = { args: { scanSpendCents: 171 } }
export const Spent: Story = { args: { scanSpendCents: 300 } }
export const NoCheckpoints: Story = { args: { monthlyBudgetCutoffs: [] } }
