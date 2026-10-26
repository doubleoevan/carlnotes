import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { ScrollBox } from "./ScrollBox"

// a long note exercises the bounded scroll and its optional copy action
const NOTE = "A good cup takes a little patience.\n\n".repeat(20)
const meta: Meta<typeof ScrollBox> = {
	title: "Common/ScrollBox",
	component: ScrollBox,
	parameters: { webReference: "apps/web/src/components/common/ScrollBox.tsx at 375px", surface: "card" },
	args: { children: NOTE },
	render: ({ children, ...props }) => (
		<ScrollBox {...props}>
			<Text className="text-sm leading-relaxed">{children}</Text>
		</ScrollBox>
	),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const WithCopyButton: Story = { args: { copyMarkdown: NOTE } }
