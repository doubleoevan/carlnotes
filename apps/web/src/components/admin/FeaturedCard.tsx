// the admin console's featured section: the home's pinned topics and pinned podcast episodes, each list in its order,
// with a step up, a step down, and a clear on every row

import { sendPodcastEpisodeFeatureOrder } from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicFeatureOrder } from "@carlnotes/client/topicClient"
import type { FeaturedTopic } from "@carlnotes/contracts/admin"
import { type FeaturedPodcastEpisode, toFeaturedPodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { ArrowDown, ArrowUp, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { CARD_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// one pinned row as the lists show it: its page and label, and its position from one
type FeaturedRow = { id: string; label: string; path: string; featureOrder: number }

type FeaturedCardProps = {
	featuredTopics: FeaturedTopic[]
	featuredPodcastEpisodes: FeaturedPodcastEpisode[]
	onSaved: () => void
}

/**
 * Renders the two pin lists. A row steps up or down one position or clears its pin, and each move saves at once.
 */
export function FeaturedCard({ featuredTopics, featuredPodcastEpisodes, onSaved }: FeaturedCardProps) {
	return (
		<section className={cn(CARD_CLASS, "flex flex-col gap-4")}>
			<p className="text-sm text-muted-foreground">
				The home shows the pinned topics and podcast episodes first, in this order, then the trending ones. Pin one from
				its page's actions menu.
			</p>
			<FeaturedList
				heading="Topics"
				rows={featuredTopics.map((featuredTopic) => ({
					id: featuredTopic.id,
					label: featuredTopic.name,
					path: toTopicPath(featuredTopic),
					featureOrder: featuredTopic.featureOrder,
				}))}
				onMove={sendTopicFeatureOrder}
				onSaved={onSaved}
			/>
			<FeaturedList
				heading="Podcast episodes"
				rows={featuredPodcastEpisodes.map((featuredPodcastEpisode) => ({
					id: featuredPodcastEpisode.id,
					label: toFeaturedPodcastEpisodeLabel(featuredPodcastEpisode),
					path: featuredPodcastEpisode.pagePath,
					featureOrder: featuredPodcastEpisode.featureOrder,
				}))}
				onMove={sendPodcastEpisodeFeatureOrder}
				onSaved={onSaved}
			/>
		</section>
	)
}

type FeaturedListProps = {
	heading: string
	rows: FeaturedRow[]
	// sends one row's new position, zero to clear it
	onMove: (id: string, position: number) => Promise<void>
	onSaved: () => void
}

// one pin list: its heading, its rows in order, and the line for an empty list
function FeaturedList({ heading, rows, onMove, onSaved }: FeaturedListProps) {
	const [movingRowId, setMovingRowId] = useState<string | null>(null)

	// send one move, then reload the console. send one move, then reload the console
	async function handleMove(row: FeaturedRow, position: number): Promise<void> {
		setMovingRowId(row.id)
		try {
			await onMove(row.id, position)
			onSaved()
		} catch (error) {
			console.error("feature order failed", error)
			toast.error(SAVE_FAILED_TEXT)
		} finally {
			setMovingRowId(null)
		}
	}
	return (
		<div className="space-y-1.5">
			<h3 className="text-sm font-semibold">{heading}</h3>
			{rows.length === 0 && <p className="text-sm text-muted-foreground">None pinned.</p>}
			{rows.map((row, index) => (
				<div key={row.id} className="flex min-h-9 items-center gap-2 text-sm">
					<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{row.featureOrder}</span>
					<AnchorLink href={row.path} className={cn(STANDALONE_LINK_CLASS, "min-w-0 flex-1 truncate")}>
						{row.label}
					</AnchorLink>
					{/* the step buttons at the ends of the list are disabled, and the X clears the pin */}
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Move ${row.label} up`}
						disabled={index === 0 || movingRowId !== null}
						onClick={() => void handleMove(row, row.featureOrder - 1)}
					>
						<ArrowUp className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Move ${row.label} down`}
						disabled={index === rows.length - 1 || movingRowId !== null}
						onClick={() => void handleMove(row, row.featureOrder + 1)}
					>
						<ArrowDown className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Clear ${row.label} from the featured ${heading.toLowerCase()}`}
						disabled={movingRowId !== null}
						onClick={() => void handleMove(row, 0)}
					>
						<X className="size-4" />
					</Button>
				</div>
			))}
		</div>
	)
}
