import type { Meta, StoryObj } from "@storybook/react-native"
import { SpendMeter } from "./SpendMeter"

// cover the web's grouped, moving, passed, and absent pause checkpoints
const meta = {
	title: "Account/SpendMeter",
	component: SpendMeter,
	parameters: { surface: "card", webReference: "Account/SpendMeter" },
	args: {
		activity: {
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
	},
} satisfies Meta<typeof SpendMeter>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PassedCheckpoints: Story = { args: { activity: { ...meta.args.activity, scanSpendCents: 171 } } }
export const Spent: Story = { args: { activity: { ...meta.args.activity, scanSpendCents: 300 } } }
export const NoCheckpoints: Story = { args: { activity: { ...meta.args.activity, monthlyBudgetCutoffs: [] } } }
