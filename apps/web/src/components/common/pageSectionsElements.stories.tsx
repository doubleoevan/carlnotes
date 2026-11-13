// the section elements a profile and a team share: two accordion sections, one with an empty section's card
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Accordion } from "@/components/primitives/accordion"
import { PAGE_SECTIONS_ELEMENTS } from "./pageSectionsElements"

// a section with its count, and an empty one below it, both open
function PageSectionsElementsPreview() {
	const { Section, EmptyCard } = PAGE_SECTIONS_ELEMENTS
	return (
		<Accordion type="multiple" defaultValue={["topics", "teams"]}>
			<Section value="topics" title="All Topics" countLabel="2 topics">
				<p className="text-sm">The section's table</p>
			</Section>
			<Section value="teams" title="All Teams" countLabel={undefined}>
				<EmptyCard text="No public teams." />
			</Section>
		</Accordion>
	)
}

const meta = {
	title: "Common/PageSectionsElements",
	component: PageSectionsElementsPreview,
} satisfies Meta<typeof PageSectionsElementsPreview>

export default meta
type Story = StoryObj<typeof meta>

// the title rows, the count at the far right, and the empty card
export const Default: Story = {}
