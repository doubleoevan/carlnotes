import type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"

// story controls stay local and never write to an account's findings
export const STORY_TOPIC_FEED_HANDLERS: TopicFeedHandlers = {
	openTopicFinding: () => undefined,
	consumeTopicFinding: () => undefined,
	rateTopicFinding: () => undefined,
	bookmarkTopicFinding: () => undefined,
}

// the named web counterparts used for phone-width visual comparisons
export const FEED_WEB_REFERENCES = {
	feed: "apps/web/src/pages/HomePage.tsx, apps/web/src/components/topic/TopicSection.tsx at 375px",
	topic: "apps/web/src/components/topic/TopicFindingsSection.tsx at 375px",
	resource: "apps/web/src/components/topic/TopicResource.tsx and TopicResourceInfo.tsx at 375px",
	controls:
		"apps/web/src/components/topic/TopicFeedSort.tsx and apps/web/src/components/search/SearchFilters.tsx at 375px",
}
