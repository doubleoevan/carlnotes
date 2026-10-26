import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteIcon } from "./NoteIcon"

// the native tile follows the web's shared note icon
const meta = {
	title: "Branding/NoteIcon",
	component: NoteIcon,
	parameters: { webReference: "apps/web/src/components/branding/NoteIcon.tsx" },
} satisfies Meta<typeof NoteIcon>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
