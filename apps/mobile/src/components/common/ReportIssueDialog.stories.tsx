import type { Meta, StoryObj } from "@storybook/react-native"
import { ReportIssueDialog } from "./ReportIssueDialog"

// preview the same question, input, and actions as the web report dialog
const meta = {
	title: "Common/ReportIssueDialog",
	component: ReportIssueDialog,
	args: {
		subjectKind: "topic",
		subjectId: "report-preview",
		subjectLabel: "AI Coding Best Practices & Tricks",
		onClose: () => undefined,
	},
	parameters: { webReference: "apps/web/src/components/common/ReportIssueDialog.tsx at 375px" },
} satisfies Meta<typeof ReportIssueDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
