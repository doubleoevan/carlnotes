import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { Pagination } from "./Pagination"

// exercise page changes without an API request
const meta: Meta<typeof Pagination> = {
	title: "Common/Pagination",
	component: Pagination,
	parameters: { webReference: "apps/web/src/components/common/Pagination.tsx at 375px" },
	args: { label: "Episodes", pageNumber: 1, pageCount: 4 },
	render: function Example(args) {
		const [pageNumber, setPageNumber] = useState(args.pageNumber)
		return <Pagination {...args} pageNumber={pageNumber} onOpenPage={setPageNumber} />
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ManyPages: Story = { args: { pageNumber: 8, pageCount: 20 } }
