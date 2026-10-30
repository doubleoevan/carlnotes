import type { Meta, StoryObj } from "@storybook/react-native"
import { AppVersionLine } from "./AppVersionLine"

// the Account screen's closing version line: a store build, a build running an EAS Update, and a development build
const meta = {
	title: "Account/AppVersionLine",
	component: AppVersionLine,
	args: { appVersion: "1.2.0", nativeBuildVersion: "34", updateId: null },
	parameters: { webReference: "none, a native line. the web loads the current app on every visit" },
} satisfies Meta<typeof AppVersionLine>
export default meta
type Story = StoryObj<typeof meta>
export const StoreBuild: Story = {}
export const WithUpdate: Story = { args: { updateId: "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d" } }
export const Development: Story = { args: { appVersion: null, nativeBuildVersion: null } }
