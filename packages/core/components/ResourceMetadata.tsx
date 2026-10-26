import type { TopicFinding } from "@carlnotes/contracts/findings"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { toAgeLabel } from "../lib/labels"

// platform elements draw the source icon and the same publication metadata
export type ResourceMetadataComponents = {
	Favicon: ComponentType<{ faviconPath: string | null }>
	Text: ComponentType<{ children: ReactNode }>
}

/**
 * Shows a finding's source and publication age, with a favicon only when its source is known.
 */
export function ResourceMetadata({
	resource,
	components: { Favicon, Text },
}: {
	resource: Pick<TopicFinding, "source" | "publishedAt" | "faviconPath">
	components: ResourceMetadataComponents
}) {
	return (
		<>
			{resource.source ? <Favicon faviconPath={resource.faviconPath} /> : null}
			<Text>{toDotSeparatedText([resource.source, toAgeLabel(resource.publishedAt)])}</Text>
		</>
	)
}
