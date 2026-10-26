import type { ScanRecapFields } from "@carlnotes/core/lib/topicScanRecap"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TopicScanRecap } from "./TopicScanRecap"
import { STORY_SCAN_SOURCE_RESULTS, STORY_TOPIC_PAGE } from "./topicPageStories"

// a long diary keeps source footnotes visible while its findings remain scrollable
const SCAN: ScanRecapFields = {
	status: "succeeded",
	error: null,
	stoppedAt: null,
	startedAt: "2026-10-22T12:00:00Z",
	finishedAt: "2026-10-22T12:03:00Z",
	costDollars: 0.12,
	scanSummary:
		"Context engineering is the dominant thread. **Start with a small, useful task.**\n\nStandouts: give the agent a map of the codebase and show it how to run checks.\n\nThe numbers: 10 kept, 75 filtered.\n\n## What to try\n\n- Keep instructions concrete.\n- Verify the work before handing it off.\n\nAn untrusted [destination](https://untrusted.example) remains plain text.",
	sourceResults: STORY_SCAN_SOURCE_RESULTS,
}
const meta: Meta<typeof TopicScanRecap> = {
	title: "Topic/TopicScanRecap",
	component: TopicScanRecap,
	parameters: { webReference: "apps/web/src/components/topic/TopicScanRecap.tsx at 375px", surface: "card" },
	args: { scan: SCAN, findings: STORY_TOPIC_PAGE.findings, topic: STORY_TOPIC_PAGE },
	decorators: [
		(Story) => (
			<ScrollView className="w-full">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const MissingNote: Story = { args: { scan: { ...SCAN, scanSummary: null } } }
export const Failed: Story = { args: { scan: { ...SCAN, status: "failed", scanSummary: null, error: "Scan failed" } } }
export const Running: Story = {
	args: { scan: { ...SCAN, status: "running", finishedAt: null, scanSummary: null, sourceResults: null } },
}
