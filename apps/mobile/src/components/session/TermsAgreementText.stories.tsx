import type { Meta, StoryObj } from "@storybook/react-native"
import { TermsAgreementText } from "./TermsAgreementText"

// the acceptance line under the sign-in and sign-up buttons, with the web's words and links
const meta: Meta<typeof TermsAgreementText> = {
	title: "Session/TermsAgreementText",
	component: TermsAgreementText,
	parameters: { webReference: "apps/web/src/components/session/SessionLayout.tsx at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
