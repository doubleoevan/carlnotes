import { createFileRoute } from "@tanstack/react-router"
import { toStaticHeadTags } from "@/lib/pageHead"
import { PrivacyPage } from "@/pages/PrivacyPage"

// the privacy page, with its own title, description, card, and canonical url
export const Route = createFileRoute("/_layout/privacy")({
	head: () =>
		toStaticHeadTags({
			title: "Privacy",
			path: "/privacy",
			description: "The CarlNotes Privacy Policy: what data CarlNotes collects and how it is used.",
		}),
	component: PrivacyPage,
})
