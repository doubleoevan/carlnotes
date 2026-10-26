import type { TopicFinding } from "@carlnotes/contracts/findings"
import { toPlainText } from "@carlnotes/contracts/spokenText"
import type { ComponentType, ReactNode } from "react"

// platform elements preserve semantic lists and native text/link targets
type Container = ComponentType<{ children: ReactNode }>
export type NumberedTopicFindingListComponents = {
	List: Container
	Row: Container
	Link: ComponentType<{ href: string; title: string; children: ReactNode }>
	Source: Container
	Explanation: Container
}

/**
 * Renders ranked Finding links, source labels, and explanations from the same composition.
 */
export function NumberedTopicFindingList({
	findings,
	components: { List, Row, Link, Source, Explanation },
}: {
	findings: TopicFinding[]
	components: NumberedTopicFindingListComponents
}) {
	if (findings.length === 0) {
		return null
	}
	return (
		<List>
			{findings.map((finding, index) => {
				const title = toPlainText(finding.title ?? "") || finding.url
				return (
					<Row key={finding.findingId}>
						{/* the title opens the stored destination */}
						<Link href={finding.url} title={title}>
							{index + 1}. {title}
						</Link>
						{/* keep the host and explanation below their Finding */}
						{finding.source && <Source>{finding.source}</Source>}
						<Explanation>{toPlainText(finding.relevanceExplanation)}</Explanation>
					</Row>
				)
			})}
		</List>
	)
}
