import type { Meta, StoryObj } from "@storybook/react-native"
import { fn } from "storybook/test"
import { PersonalSourcesImportButton } from "./PersonalSourcesImportButton"

// both platforms use the shared opener and disable it while receiving is unavailable
const meta = {
	title: "Topic/PersonalSourcesImportButton",
	component: PersonalSourcesImportButton,
	args: { topicId: "topic-example", onImported: fn(async () => {}), isDisabled: false },
	parameters: { webReference: "apps/web/src/components/topic/PersonalSourcesImportButton.stories.tsx at 375px" },
} satisfies Meta<typeof PersonalSourcesImportButton>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Disabled: Story = { args: { isDisabled: true } }
