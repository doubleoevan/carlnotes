import { useParams } from "react-router-dom"

/**
 * The page for a single topic at /topics/:id
 */
export function TopicPage() {
	const { id } = useParams()
	return (
		<div className="mx-auto max-w-5xl px-4 py-8">
			<h1 className="font-display text-2xl">Topic {id}</h1>
			<p className="text-muted-foreground mt-2 text-sm">This page is coming soon.</p>
		</div>
	)
}
