import { createFileRoute } from "@tanstack/react-router"
import { fetchPublicTopics } from "@/clients/topicClient"
import { toStaticHeadTags } from "@/lib/pageHead"
import { PublicTopicsPage } from "@/pages/PublicTopicsPage"

// the public topics page, which loads every shown public topic, most recently changed first
export const Route = createFileRoute("/_layout/topics/")({
	loader: () => fetchPublicTopics(),
	head: () =>
		toStaticHeadTags({
			title: "Public topics",
			path: "/topics",
			description: "Every public topic Carl reads for, newest first.",
		}),
	component: PublicTopicsPage,
})
