// the section pattern: a page section's title at the left in the display font at text-xl with its count at the far
// right, a divider under the section while it is closed, and an empty section's one muted line in a card
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { EmptyListCard, TableCard } from "@/components/table/TableCard"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"

/**
 * Renders a page section over the section that follows it, as every page writes one. The title takes the
 * `sectionTitle` type role. The count names what the section holds, shows no count at zero, and may hide on a narrow
 * screen under a title too long to leave it room. A closed section shows a divider while another section follows it.
 */
function SectionPattern({
	title,
	countNoun,
	rowCount,
	isCountHiddenOnNarrowScreens,
}: {
	title: string
	// what the section holds, in the singular, which its count and its empty line name
	countNoun: string
	rowCount: number
	// whether the count hides on a narrow screen, for a title too long to leave the count room there
	isCountHiddenOnNarrowScreens: boolean
}) {
	return (
		<div style={{ maxWidth: 560 }}>
			{/* the section: its rows in a card, or its one muted line in the same card while it holds none */}
			<CollapsibleSection
				value="section"
				title={title}
				countLabel={toSectionCountLabel(rowCount, countNoun)}
				isCountHiddenOnNarrowScreens={isCountHiddenOnNarrowScreens}
				hasClosedDivider
			>
				{rowCount === 0 ? (
					<EmptyListCard>{`No ${countNoun}s yet.`}</EmptyListCard>
				) : (
					<TableCard className="mb-2">
						<p className="text-sm">{`The section's ${rowCount} rows.`}</p>
					</TableCard>
				)}
			</CollapsibleSection>
			{/* the section that follows it, the last one, which shows no divider */}
			<CollapsibleSection value="next" title="Tasting Notes" countLabel="2 notes">
				<TableCard className="mb-2">
					<p className="text-sm">The next section's rows.</p>
				</TableCard>
			</CollapsibleSection>
		</div>
	)
}

const meta = {
	title: "Patterns/Section",
	component: SectionPattern,
	args: { title: "Brew diary", countNoun: "brew", rowCount: 12, isCountHiddenOnNarrowScreens: false },
	argTypes: {
		title: { control: "text" },
		countNoun: { control: "text" },
		rowCount: { control: "number" },
		isCountHiddenOnNarrowScreens: { control: "boolean" },
	},
} satisfies Meta<typeof SectionPattern>

export default meta
type Story = StoryObj<typeof meta>

// the title at the left and the count at the far right
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("12 brews")).toBeVisible()
	},
}

// a section that holds nothing shows no count, and its one line sits in a card
export const Empty: Story = {
	args: { rowCount: 0 },
	play: async ({ canvas }) => {
		await expect(canvas.queryByText("0 brews")).toBeNull()
		await expect(canvas.getByText("No brews yet.")).toBeVisible()
	},
}

// a closed section above another shows a divider under its title
export const Closed: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Brew diary" }))
		await expect(canvas.getByRole("button", { name: "Brew diary" })).toHaveAttribute("aria-expanded", "false")
	},
}

// a long title on a phone, where the count hides to leave the title its room
export const LongTitleOnAPhone: Story = {
	args: {
		title: "Coffee Break podcast episodes",
		countNoun: "episode",
		rowCount: 5,
		isCountHiddenOnNarrowScreens: true,
	},
	globals: PHONE_VIEWPORT_GLOBALS,
}
