// a host's favicon in a round chip at the metadata line's size, or the globe when the host has none
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { HostFavicon } from "./HostFavicon"

// a dark rounded-square glyph as an inline svg, so the loaded favicon needs no network request
const FAVICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="3"/></svg>',
)}`

// a data url whose bytes do not decode, so the image fails to load without leaving the page
const BROKEN_FAVICON_DATA_URL = "data:image/png;base64,AAAA"

const meta = {
	title: "Common/HostFavicon",
	component: HostFavicon,
	args: { faviconPath: FAVICON_DATA_URL },
	argTypes: { faviconPath: { control: "text" } },
	// the muted metadata line under a finding's title, which shows the chip before the host and the age
	render: (args) => (
		<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
			<HostFavicon {...args} />
			example.com · 2d
		</p>
	),
	// the cards, popovers, tables, and link previews that show the metadata line
	parameters: { surface: "card" },
} satisfies Meta<typeof HostFavicon>

export default meta
type Story = StoryObj<typeof meta>

// a host's favicon, drawn once it loads
export const Default: Story = {}

// a host with no stored favicon, which shows the globe
export const NoFavicon: Story = { args: { faviconPath: null } }

// a favicon the browser cannot draw, which falls back to the globe
export const BrokenFavicon: Story = { args: { faviconPath: BROKEN_FAVICON_DATA_URL } }
