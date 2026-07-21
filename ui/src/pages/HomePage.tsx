import { topicSectionKeys } from "@shared/enums"
import { RotateCw } from "lucide-react"
import { useState } from "react"
import { CoffeeSteam } from "@/components/branding/CoffeeSteam"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { PageSkeleton } from "@/components/topic-feed/PageSkeleton"
import { TopicSection } from "@/components/topic-feed/TopicSection"
import { UnreadToggle } from "@/components/UnreadToggle"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * The homepage topic feed sections
 */
export function HomePage() {
	const { topicFeed, showAll, setShowAll, resourceKinds, reload } = useTopicFeed()
	// increment when the refresh button is pressed to remount the sections so their hydrate animation replays
	const [refreshKey, setRefreshKey] = useState(0)
	// refresh refetches the topic feed and replays the load animation
	const handleRefresh = async () => {
		// wait for the refreshed topic feed so the entrance animation replays over the new content, not the old
		await reload()
		setRefreshKey((previousKey) => previousKey + 1)
	}

	// the remount key changes on refresh, the "All" "Unread" toggle, or the resource kind filters so updated content animates in
	const viewKey = `${refreshKey}-${showAll}-${[...resourceKinds].sort().join()}`
	return (
		<div className="relative min-h-screen">
			<CoffeeSteam />
			<main className="relative z-10 mx-auto max-w-5xl px-4 py-8">
				{/* the "All" "Unread" toggle and Refresh button */}
				<div className="mb-3 flex items-center justify-between">
					<UnreadToggle showAll={showAll} onChange={setShowAll} />
					<Button
						variant="secondary"
						size="sm"
						onClick={handleRefresh}
						className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
					>
						<RotateCw className="size-4" />
						Refresh
					</Button>
				</div>

				{/* skeleton animation while loading */}
				{topicFeed === null && <PageSkeleton />}

				{/* the topic sections with a viewKey prop so any change replays the hydrate animation */}
				{topicFeed && (
					<Accordion key={viewKey} type="multiple" defaultValue={[...topicSectionKeys]}>
						{topicFeed.sections.map((section) => (
							<TopicSection key={section.key} section={section} />
						))}
					</Accordion>
				)}
			</main>
		</div>
	)
}
