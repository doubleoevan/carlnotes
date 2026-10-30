import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AppUpdateNotice } from "./AppUpdateNotice"

// the update notice as an outdated build sees it, with and without the minimum the response named
const meta: Meta<typeof AppUpdateNotice> = {
	title: "Session/AppUpdateNotice",
	component: AppUpdateNotice,
	args: { minimumVersion: "1.2.0" },
	parameters: { webReference: "none, a native notice. the frame is apps/web/src/components/session/SessionLayout.tsx" },
	decorators: [
		(Story) => (
			<QueryClientProvider client={new QueryClient()}>
				<Story />
			</QueryClientProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const WithMinimum: Story = {}
export const WithoutMinimum: Story = { args: { minimumVersion: null } }
