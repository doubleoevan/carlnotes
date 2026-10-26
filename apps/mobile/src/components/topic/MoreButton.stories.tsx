import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { MoreButton } from "./MoreButton"

// compare the web's MoreButton label, inset, arrows, and local expansion state
const meta = {
	title: "Topic/MoreButton",
	component: MoreButton,
	parameters: { webReference: "apps/web/src/components/topic/MoreButton.tsx at 375px" },
	args: { isExpanded: false, moreCount: 15, onToggle: () => undefined },
	render: (props) => <MoreButtonExample {...props} />,
} satisfies Meta<typeof MoreButton>
export default meta
type Story = StoryObj<typeof meta>
export const More: Story = {}
export const Less: Story = { args: { isExpanded: true } }

// keep the toggle interactive without navigation or requests
function MoreButtonExample(props: React.ComponentProps<typeof MoreButton>) {
	const [isExpanded, setIsExpanded] = useState(props.isExpanded)
	return <MoreButton {...props} isExpanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
}
