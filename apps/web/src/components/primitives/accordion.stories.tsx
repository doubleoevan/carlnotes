// the accordion primitive: stacked sections, each a trigger with a leading chevron over a collapsible body
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion"

// the invented sections every story stacks, as the profile and admin pages do
const ACCORDION_SECTIONS = [
	{
		value: "topics",
		title: "Your topics",
		body: "LLM tooling, Coffee roasting, and Bike repair, each with a weekly scan.",
	},
	{
		value: "teams",
		title: "Teams",
		body: "Vienna Example and two others read the Reading Group's topics together.",
	},
	{
		value: "sources",
		title: "Sources",
		body: "Three feeds at example.com, one subreddit, and a web search Carl runs before each scan.",
	},
]

const meta = {
	title: "Primitives/Accordion",
	component: Accordion,
	args: { type: "multiple", defaultValue: ["topics", "teams"], disabled: false, onValueChange: fn() },
	argTypes: {
		type: { control: "inline-radio", options: ["multiple", "single"] },
		disabled: { control: "boolean" },
		collapsible: { control: "boolean" },
		defaultValue: { control: false },
		onValueChange: { control: false },
		children: { control: false },
	},
	// the sections fill the frame as they fill the page column, each trigger in the semibold weight the pages give it
	render: (args) => (
		<Accordion {...args}>
			{ACCORDION_SECTIONS.map((section) => (
				<AccordionItem key={section.value} value={section.value}>
					<AccordionTrigger className="font-semibold">{section.title}</AccordionTrigger>
					<AccordionContent>
						<p className="text-foreground text-sm">{section.body}</p>
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	),
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

// any number of sections open at once, the way every page in the app uses it
export const Multiple: Story = {}

// one section open at a time, closable by its own trigger. no page in the app uses this mode
export const Single: Story = { args: { type: "single", defaultValue: "topics", collapsible: true } }

// every section closed, with each chevron pointing right
export const AllClosed: Story = { args: { defaultValue: [] } }

// every trigger disabled, so no section opens or closes. it looks the same as Multiple, and the app disables none
export const Disabled: Story = { args: { disabled: true } }
