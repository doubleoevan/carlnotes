import { toPersonalSourcesSectionTitle } from "./personalSourcesCopy"

// both primitive stories use the same disclosure metadata and detail text
export const EXPANDABLE_ROW_STORIES = {
	section: {
		title: toPersonalSourcesSectionTitle(7),
		metadata: "Only you can see this",
		variant: "section",
		isLast: true,
		details: "The sender's numbered Personal sources items open here.",
	},
	source: { title: "AI Agent: Claude", metadata: "2 this week", details: "Eval drift and replay sets · Nov 2" },
	item: {
		title: "Eval drift and replay sets",
		metadata: "Nov 2",
		tag: "Claude",
		details: "Working on an eval harness. Open question: how often to refresh the golden set.",
	},
	long: {
		title: "A longer conversation about evaluating agent behavior across repeated experiments and changing datasets",
		metadata: "Nov 2",
		tag: "Claude",
		details: "A long stored note remains readable when text size increases.",
	},
} as const
