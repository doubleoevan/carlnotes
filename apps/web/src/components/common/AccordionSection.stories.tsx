// a page's sections as the Topics page and the home page draw them: the open one has no divider, a closed one does
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Accordion } from "@/components/primitives/accordion"
import { AccordionSection } from "./AccordionSection"

const meta = {
	title: "Common/AccordionSection",
	component: AccordionSection,
	args: { value: "home-topics", title: "Home topics", countLabel: "6 topics", children: "The section's cards" },
	argTypes: {
		title: { control: "text" },
		countLabel: { control: "text" },
		children: { control: "text" },
		onTriggerClick: { control: false },
	},
	// the section sits in an accordion with a closed one under it, which shows the divider a closed section draws
	render: (args) => (
		<Accordion type="multiple" defaultValue={[args.value]}>
			<AccordionSection {...args} />
			<AccordionSection value="your-topics" title="Your topics" countLabel="10 topics">
				Your topics' cards
			</AccordionSection>
			<AccordionSection value="popular-topics" title="Popular topics" countLabel="12 topics">
				The popular topics' cards
			</AccordionSection>
		</Accordion>
	),
} satisfies Meta<typeof AccordionSection>

export default meta
type Story = StoryObj<typeof meta>

// the first section open over two closed ones
export const Default: Story = {}

// a section whose count is not known yet
export const NoCount: Story = { args: { countLabel: undefined } }
