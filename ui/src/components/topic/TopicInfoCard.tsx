import type { TopicResponse } from "@shared/contracts"
import { INFO_CARD_CLASS } from "@/lib/utils"
import { CollapsibleSection } from "./CollapsibleSection"
import { TopicInfo } from "./TopicInfo"

/**
 * The topic page's info card shown under "Topic roast"
 */
export function TopicInfoCard({ topic }: { topic: TopicResponse }) {
	return (
		<CollapsibleSection value="roast" title="Topic roast" className="min-w-0">
			<div className={INFO_CARD_CLASS}>
				<TopicInfo topic={topic} isCard />
			</div>
		</CollapsibleSection>
	)
}
