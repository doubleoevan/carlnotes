import { createFileRoute } from "@tanstack/react-router"
import { toStaticHeadTags } from "@/lib/pageHead"
import { TermsPage } from "@/pages/TermsPage"

// the terms page, with its own title, description, card, and canonical url
export const Route = createFileRoute("/_layout/terms")({
	head: () =>
		toStaticHeadTags({
			title: "Terms",
			path: "/terms",
			description: "The CarlNotes Terms of Service: the agreement for using CarlNotes.",
		}),
	component: TermsPage,
})
