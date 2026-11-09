// the card elements the topic and podcast episode cards build on: the box one link stretches over, the topic image at
// the page size, and a text row
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { CARD_ELEMENTS } from "./cardElements"

// the shared pieces around two lines of text, with no image yet, so the muted ground shows
function CardElementsPreview() {
	const { Card, Image, Row } = CARD_ELEMENTS
	return (
		<Card path="/topics" label="Open the topic" className={cardClasses.root}>
			<Image image={null} name="A topic" />
			<Row className={cardClasses.body}>
				<span className="font-display text-lg leading-tight">A topic</span>
				<span className="text-muted-foreground text-xs">The text rows under the image</span>
			</Row>
		</Card>
	)
}

const meta = {
	title: "Common/CardElements",
	component: CardElementsPreview,
} satisfies Meta<typeof CardElementsPreview>

export default meta
type Story = StoryObj<typeof meta>

// the box, the image ground, and one row
export const Default: Story = {}
