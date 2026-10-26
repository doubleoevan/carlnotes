import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "./CollapsibleSection"

// the native counterpart of the web component
const meta = {
	title: "Topic/CollapsibleSection",
	component: CollapsibleSection,
	parameters: { webReference: "apps/web/src/components/topic/CollapsibleSection.tsx at 375px" },
	args: { title: "Topic roast", children: "A note from Carl." },
	render: ({ children, ...args }) => (
		<CollapsibleSection {...args}>
			<Text className="text-sm">{children}</Text>
		</CollapsibleSection>
	),
} satisfies Meta<typeof CollapsibleSection>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
