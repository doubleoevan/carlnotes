import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CreateNote } from "./CreateNote"

// show the creation form in a keyboard-aware sheet on a synthetic page
const meta = {
	title: "Note/CreateNote",
	component: CreateNoteStory,
	parameters: { webReference: "apps/web/src/components/note/CreateNote.tsx", surface: "card" },
} satisfies Meta<typeof CreateNoteStory>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Offline: Story = { args: { isDisabled: true } }
function CreateNoteStory({ isDisabled = false }: { isDisabled?: boolean }) {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<View>
			<Button ref={triggerRef} accessibilityLabel="New note" onPress={() => setIsOpen(true)}>
				<Text>New note</Text>
			</Button>
			{isOpen && (
				<Sheet title="New note" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<CreateNote
						page={{ pageType: "topic", pageId: "storybook-note-preview" }}
						creatableVisibilities={["private", "team", "public"]}
						isDisabled={isDisabled}
						onCreated={() => setIsOpen(false)}
					/>
				</Sheet>
			)}
		</View>
	)
}
