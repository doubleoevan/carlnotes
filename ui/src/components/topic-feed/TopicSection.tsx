import type { TopicFeedResponse } from "@shared/contracts"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Topic } from "./Topic"

// the section titles mapped to their section key
const SECTION_TITLE = { yours: "Your topics", featured: "Featured", popular: "Popular" }

// a topic feed section with its key and its topic feeds
type TopicSectionProps = { section: TopicFeedResponse["sections"][number] }

/**
 * A collapsible section of topics: "Your topics", "Featured" or "Popular"
 */
export function TopicSection({ section }: TopicSectionProps) {
	return (
		<AccordionItem value={section.key}>
			<AccordionTrigger>
				<span className="font-display flex-1 text-xl">{SECTION_TITLE[section.key]}</span>
				<span className="text-muted-foreground text-sm">{section.topics.length}</span>
			</AccordionTrigger>
			<AccordionContent>
				{/* the section topics, or Carl's empty line */}
				{section.topics.length === 0 && (
					<p className="text-muted-foreground pb-4 text-sm">{`Carl hasn't filed anything here yet.`}</p>
				)}
				{section.topics.map((topic, index) => (
					<Topic key={topic.id} topic={topic} index={index} />
				))}
			</AccordionContent>
		</AccordionItem>
	)
}
