import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { SkeletonPulse } from "./SkeletonPulse"

// the system's Reduce Motion setting makes these shapes static
const meta = {
	title: "Common/SkeletonPulse",
	component: SkeletonPulse,
	args: { children: null },
	render: () => (
		<SkeletonPulse>
			<View className="h-6 w-40 rounded bg-muted" />
		</SkeletonPulse>
	),
} satisfies Meta<typeof SkeletonPulse>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
