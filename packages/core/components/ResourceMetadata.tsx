import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { ComponentType } from "react"
import { toAgeLabel } from "../lib/labels"
import { DotSeparatedTexts, type DotSeparatedTextsElements } from "./DotSeparatedTexts"

// platform elements draw the source icon and the same publication metadata
export type ResourceMetadataComponents = {
	Favicon: ComponentType<{ faviconPath: string | null }>
	Text: DotSeparatedTextsElements["Text"]
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
			<DotSeparatedTexts texts={[resource.source, toAgeLabel(resource.publishedAt)]} elements={{ Text }} />
		</>
	)
}
