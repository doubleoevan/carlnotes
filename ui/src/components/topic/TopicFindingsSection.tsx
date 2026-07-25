import type { TopicFinding } from "@shared/contracts"
import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { TopicResource } from "@/components/topic-feed/TopicResource"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { ExpanderButton } from "./ExpanderButton"

// the max topic finding rows shown before the expander
const MAX_TOPIC_FINDINGS = 5

// the topic findings section props: the view-filtered rows, whether any exist at all, ratability, and the row handlers
type TopicFindingsSectionProps = {
	topicFindings: TopicFinding[]
	hasAnyFindings: boolean
	isRatable: boolean
	handlers: TopicFeedHandlers
}

// the collapsible topic findings list, capped at five rows with the homepage expander
export function TopicFindingsSection({
	topicFindings,
	hasAnyFindings,
	isRatable,
	handlers,
}: TopicFindingsSectionProps) {
	const [isExpanded, setIsExpanded] = useState(false)
	// cap the rows unless expanded
	const topicFindingsShown = isExpanded ? topicFindings : topicFindings.slice(0, MAX_TOPIC_FINDINGS)
	const moreTopicFindingsCount = topicFindings.length - MAX_TOPIC_FINDINGS
	return (
		<Accordion type="multiple" defaultValue={["findings"]} className="mt-4">
			<AccordionItem value="findings">
				<AccordionTrigger className="py-2">
					<span className="font-display text-lg">Findings</span>
				</AccordionTrigger>
				<AccordionContent>
					{/* topic finding rows with dashed separators */}
					<div className="divide-separator divide-y divide-dashed">
						{topicFindingsShown.map((finding) => (
							<TopicResource
								key={finding.findingId}
								resource={finding}
								isRatable={isRatable}
								resourceHandlers={handlers}
							/>
						))}
						{topicFindingsShown.length === 0 && (
							<p className="text-muted-foreground py-3 text-sm">
								{hasAnyFindings
									? "Nothing new worth your time. Carl checked. Twice."
									: "Carl hasn't kept anything here yet."}
							</p>
						)}
					</div>
					{moreTopicFindingsCount > 0 && (
						<ExpanderButton
							isExpanded={isExpanded}
							moreLabel={`+ ${moreTopicFindingsCount} more `}
							onToggle={() => setIsExpanded(!isExpanded)}
						/>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}
