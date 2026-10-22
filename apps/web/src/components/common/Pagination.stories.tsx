// the pagination row: page numbers between a previous and a next arrow, as buttons or as links
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { AnchorLink } from "./AnchorLink"
import { Pagination } from "./Pagination"

const meta = {
	title: "Common/Pagination",
	component: Pagination,
	args: { ariaLabel: "Findings pages", pageNumber: 1, pageCount: 8, onOpenPage: fn() },
	argTypes: {
		ariaLabel: { control: "text" },
		pageNumber: { control: { type: "number", min: 1 } },
		pageCount: { control: { type: "number", min: 1 } },
		rowCount: { control: { type: "number", min: 0 } },
		className: { control: "text" },
		onOpenPage: { control: false },
		renderPageLink: { control: false },
	},
	render: function RenderPagination(args) {
		// an opened page is recorded, then kept in the args so the current page moves
		const handleOpenPage = useSyncedArg<typeof args, "pageNumber">("pageNumber", args.onOpenPage)

		// the app's row of links opens a page through the url. here each link's click keeps the page in the args instead
		if (args.renderPageLink) {
			const { renderPageLink } = args
			return (
				<Pagination
					{...args}
					renderPageLink={(pageControl) =>
						renderPageLink({
							...pageControl,
							onClick: (event) => {
								pageControl.onClick(event)
								handleOpenPage(pageControl.linkedPageNumber)
							},
						})
					}
				/>
			)
		}
		return <Pagination {...args} onOpenPage={handleOpenPage} />
	},
} satisfies Meta<typeof Pagination>

export default meta
type Story = StoryObj<typeof meta>

// the first page, with the previous arrow disabled and a gap before the last page
export const FirstPage: Story = {}

// a page in the middle, with a gap on each side of it
export const MiddlePage: Story = { args: { pageNumber: 6, pageCount: 12 } }

// the last page, with the next arrow disabled
export const LastPage: Story = { args: { pageNumber: 12, pageCount: 12 } }

// a short list, which shows every page and no gap
export const FewPages: Story = { args: { pageNumber: 2, pageCount: 3 } }

// a home page section's row of links, for a list too long for the html to hold whole, so it shows without JavaScript
export const LinkRow: Story = {
	args: {
		ariaLabel: "Popular topics pages",
		className: "pt-0 pb-2",
		pageNumber: 3,
		pageCount: 9,
		rowCount: 120,
		onOpenPage: undefined,
		renderPageLink: ({ linkedPageNumber, label, className, isCurrentPage, onClick }) => (
			<AnchorLink
				href={`/?popular=${linkedPageNumber}`}
				// open the page in the args instead of navigating
				onClick={(event) => {
					event.preventDefault()
					onClick(event)
				}}
				aria-current={isCurrentPage ? "page" : undefined}
				className={className}
			>
				{label}
			</AnchorLink>
		),
	},
}
