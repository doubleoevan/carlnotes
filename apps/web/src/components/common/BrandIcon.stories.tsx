// the platform logos for sharing, sign-in, Source rows, and the Add to AI dialog, in the text color around them
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { BRANDS, BrandIcon, YoutubePlayIcon } from "./BrandIcon"

const meta = {
	title: "Common/BrandIcon",
	component: BrandIcon,
	// the size the share options, the Add to AI options, and the sign-in button draw a logo at
	args: { brand: "github", className: "size-4" },
	argTypes: {
		brand: { control: "select", options: BRANDS },
		className: { control: "text" },
	},
	// the Add to AI dialog, the share popover, and the topic card that show the logos
	parameters: { surface: "card" },
} satisfies Meta<typeof BrandIcon>

export default meta
type Story = StoryObj<typeof meta>

// one logo in the body text color
export const Default: Story = {}

// one logo on a topic's Source line, drawn in the muted text color the line sets on it, beside the Source and its
// summary
export const InheritsColor: Story = {
	args: { brand: "reddit", className: "text-muted-foreground size-3.5 shrink-0 translate-y-0.5" },
	render: (args) => (
		<div className="flex min-w-0 items-baseline gap-1.5 text-sm">
			<BrandIcon {...args} />
			<span className="min-w-0 truncate">
				reddit<span className="text-muted-foreground"> — r/LocalLLaMA</span>
			</span>
		</div>
	),
}

// every logo with its brand name
export const EveryBrand: Story = {
	render: (args) => (
		<div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
			{BRANDS.map((brand) => (
				<span key={brand} style={{ display: "grid", justifyItems: "center", gap: 4, width: 72 }}>
					<BrandIcon brand={brand} className={args.className} />
					<span className="text-muted-foreground text-xs">{brand}</span>
				</span>
			))}
		</div>
	),
}

// the red YouTube play button, the same in both themes, at the size the header draws it on the hero band
export const YoutubePlay: Story = {
	args: { className: "size-8" },
	parameters: { surface: "hero" },
	render: (args) => <YoutubePlayIcon className={args.className} />,
}
