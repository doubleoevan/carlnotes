import type { Meta, StoryObj } from "@storybook/react-native"
import { useRef } from "react"
import { Animated, View } from "react-native"
import { ScrollIndicator } from "./ScrollIndicator"

// the same themed thumb serves vertical reading boxes and horizontal formatting controls
const meta: Meta<typeof ScrollIndicator> = {
	title: "Common/ScrollIndicator",
	component: ScrollIndicator,
	parameters: { webReference: "apps/web/src/globals.css", surface: "card" },
	args: { viewportSize: 160, contentSize: 480 },
	render: (props) => {
		const scrollOffset = useRef(new Animated.Value(0)).current
		return (
			<View style={{ width: 160, height: 160 }} className="relative rounded-md border border-border bg-card">
				<ScrollIndicator {...props} scrollOffset={scrollOffset} />
			</View>
		)
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Vertical: Story = {}
export const Horizontal: Story = { args: { isHorizontal: true } }
export const ContentFits: Story = { args: { contentSize: 160 } }
