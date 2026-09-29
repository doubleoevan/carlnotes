import { toTopicPath } from "@shared/seo"
import { getRouteApi } from "@tanstack/react-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PAGE_CLASS } from "@/lib/styleClasses"

// the public topics route, whose loader reads every shown public topic
const publicTopicsRoute = getRouteApi("/_layout/topics/")

/**
 * The public topics page at /topics, each shown public topic linked with its description, most recently updated first.
 */
export function PublicTopicsPage() {
	const publicTopics = publicTopicsRoute.useLoaderData()
	return (
		<main className={PAGE_CLASS}>
			{/* the heading and its one-line intro */}
			<h1 className="font-display text-3xl">Public topics</h1>
			<p className="text-muted-foreground mt-2">What Carl is reading for everyone, one topic at a time.</p>
			{/* the public topic links, or a message if no public topic is shown */}
			<div className="mt-6">
				{publicTopics.length > 0 ? (
					<ul className="divide-y">
						{publicTopics.map((publicTopic) => (
							<li key={publicTopic.id} className="py-3">
								<AnchorLink href={toTopicPath(publicTopic)} className="text-link font-display text-lg hover:underline">
									{publicTopic.name}
								</AnchorLink>
								<p className="text-muted-foreground mt-1 text-sm">{publicTopic.description}</p>
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">No public topics yet.</p>
				)}
			</div>
		</main>
	)
}
