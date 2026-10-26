import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { Sheet } from "./Sheet"

// stable section labels for the scrolling example
const SECTION_LABELS = Array.from({ length: 20 }, (_, index) => `Section ${index + 1}`)

// exercise explicit dismissal, swipe, Android Back, and trigger focus return
const meta = {
	title: "Common/Sheet",
	component: SheetExample,
	parameters: { webReference: "patterns-infopanel--open, native bottom-sheet replacement" },
} satisfies Meta<typeof SheetExample>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Nested: Story = { args: { hasNestedSheet: true } }
export const Scrollable: Story = { args: { hasLongContent: true } }

// mount one modal lifetime from a persistent trigger
function SheetExample({
	hasNestedSheet = false,
	hasLongContent = false,
}: {
	hasNestedSheet?: boolean
	hasLongContent?: boolean
}) {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<View>
			<Button ref={triggerRef} accessibilityLabel="Open choices" onPress={() => setIsOpen(true)}>
				<Text>Open choices</Text>
			</Button>
			{isOpen ? (
				<Sheet title="Choices" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<Text>Sheet content grows with your system text size.</Text>
					{/* long content reveals the native scroll indicator in both themes */}
					{hasLongContent
						? SECTION_LABELS.map((label) => (
								<Text key={label} className="py-4">
									{label}. Scroll to read the rest of these details.
								</Text>
							))
						: null}
					{hasNestedSheet ? <NestedSheetExample /> : null}
				</Sheet>
			) : null}
		</View>
	)
}

// opening and closing the nested sheet must preserve its parent
function NestedSheetExample() {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<>
			<Button ref={triggerRef} accessibilityLabel="Open nested choices" onPress={() => setIsOpen(true)}>
				<Text>More choices</Text>
			</Button>
			{isOpen ? (
				<Sheet title="Nested choices" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<Text>Closing this sheet returns to Choices.</Text>
				</Sheet>
			) : null}
		</>
	)
}
