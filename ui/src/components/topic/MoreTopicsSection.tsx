import type { TopicResponse } from "@shared/contracts"
import { toTopicPath } from "@shared/seo"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * The links to more public topics at the end of a public topic's page.
 */
export function MoreTopicsSection({ moreTopics }: { moreTopics: TopicResponse["moreTopics"] }) {
	return (
		<section aria-labelledby="more-topics-heading" className="mt-4">
			<h2 id="more-topics-heading" className="font-display py-2 text-lg">
				More topics
			</h2>
			<ul className="flex flex-wrap gap-x-5 gap-y-1 pl-4">
				{moreTopics.map((moreTopic) => (
					<li key={moreTopic.id}>
						<AnchorLink href={toTopicPath(moreTopic)} className="text-link hover:underline">
							{moreTopic.name}
						</AnchorLink>
					</li>
				))}
			</ul>
		</section>
	)
}
