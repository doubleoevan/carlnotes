import { TermsAcceptanceNotice } from "@carlnotes/core/components/TermsAcceptanceNotice"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TERMS_ACCEPTANCE_SHEET_ELEMENTS } from "./TermsAcceptanceSheet"

// the Terms acceptance sheet as a stale account sees it: the notice over the sheet's elements, with no session behind
// it, so Accept shows the failed line and Not now closes the sheet
const meta: Meta<typeof TermsAcceptanceNotice> = {
	title: "Session/TermsAcceptanceSheet",
	component: TermsAcceptanceNotice,
	args: { elements: TERMS_ACCEPTANCE_SHEET_ELEMENTS },
	parameters: { webReference: "apps/web/src/components/session/TermsAcceptanceDialog.tsx at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
