import { useParams } from "react-router-dom"

/**
 * The edit form for a topic at /topics/:id/edit
 */
export function EditTopicPage() {
	const { id } = useParams()
	return (
		<div className="mx-auto max-w-5xl px-4 py-8">
			<h1 className="font-display text-2xl">Edit topic {id}</h1>
			<p className="text-muted-foreground mt-2 text-sm">This page is coming soon.</p>
		</div>
	)
}
