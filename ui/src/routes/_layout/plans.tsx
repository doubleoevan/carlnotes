import { createFileRoute } from "@tanstack/react-router"
import { toStaticHeadTags } from "@/lib/pageHead"
import { PlansPage } from "@/pages/PlansPage"

// the plans page, with its own title, description, card, and canonical url
export const Route = createFileRoute("/_layout/plans")({
	head: () =>
		toStaticHeadTags({
			title: "Plans",
			path: "/plans",
			description: "Carl turns caffeine into notes worth reading. Compare the CarlNotes plans, monthly or yearly.",
		}),
	component: PlansPage,
})
