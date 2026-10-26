import type { Meta, StoryObj } from "@storybook/react-native"
import { WebFeatureButton } from "./WebFeature"

// the native counterpart of the web component
const meta = {
	title: "Common/WebFeature",
	component: WebFeatureButton,
	parameters: { webReference: "apps/web/src/components/topic/TopicEditorChoiceDialog.tsx at 375px" },
	args: { title: "New topic", description: "Create a topic on carlnotes.com." },
} satisfies Meta<typeof WebFeatureButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
