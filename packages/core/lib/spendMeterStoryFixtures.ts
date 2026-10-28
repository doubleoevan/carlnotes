import type { SpendMeterProps } from "./spendMeter"

// the cutoff-enabled account shared by web and mobile component previews
export const SPEND_METER_STORY_ACTIVITY: SpendMeterProps = {
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
}

// all three cost categories at the phone account card's narrow width
export const SPEND_METER_STORY_NARROW_ACTIVITY: SpendMeterProps = {
	...SPEND_METER_STORY_ACTIVITY,
	scanSpendCents: 374,
	podcastEpisodeSpendCents: 1449,
	chatSpendCents: 870,
	budgetCents: 100000,
}
