import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { PageSkeleton, TableSkeleton } from "./PageSkeleton"

// compare the same page kinds and partial table state as the web component browser
const meta: Meta<typeof PageSkeleton> = {
	title: "Layout/PageSkeleton",
	component: PageSkeleton,
	parameters: { webReference: "apps/web/src/components/layout/PageSkeleton.stories.tsx" },
	args: { kind: "profile" },
	decorators: [
		(Story) => (
			<ScrollView className="w-full flex-1">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Profile: Story = {}
export const Teams: Story = { args: { kind: "teams" } }
export const Activity: Story = { args: { kind: "activity" } }
export const Account: Story = { args: { kind: "account" } }
export const Team: Story = { args: { kind: "team" } }
export const TopicsLoading: Story = { render: () => <TableSkeleton /> }
