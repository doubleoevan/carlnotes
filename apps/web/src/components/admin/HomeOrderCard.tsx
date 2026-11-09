// the admin console's home order section: the home's pinned topics and pinned podcast episodes, each list in its order,
// with a step up, a step down, and a clear on every row

import { sendPodcastEpisodeHomeOrder } from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicHomeOrder } from "@carlnotes/client/topicClient"
import type { HomeTopic } from "@carlnotes/contracts/admin"
import { type HomePodcastEpisode, toHomePodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { ArrowDown, ArrowUp, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { CARD_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// one pinned row as the lists show it: its page and label, and its position from one
type HomeOrderRow = { id: string; label: string; path: string; homeOrder: number }

type HomeOrderCardProps = {
	homeTopics: HomeTopic[]
	homePodcastEpisodes: HomePodcastEpisode[]
	onSaved: () => void
}

/**
 * Renders the two pin lists. A row steps up or down one position or clears its pin, and each move saves at once.
 */
export function HomeOrderCard({ homeTopics, homePodcastEpisodes, onSaved }: HomeOrderCardProps) {
	return (
		<section className={cn(CARD_CLASS, "flex flex-col gap-4")}>
			<p className="text-sm text-muted-foreground">
				The home shows the pinned topics and podcast episodes first, in this order, then the trending ones. Pin one from
				its page's actions menu.
			</p>
			<HomeOrderList
				heading="Home topics"
				rows={homeTopics.map((homeTopic) => ({
					id: homeTopic.id,
					label: homeTopic.name,
					path: toTopicPath(homeTopic),
					homeOrder: homeTopic.homeOrder,
				}))}
				onMove={sendTopicHomeOrder}
				onSaved={onSaved}
			/>
			<HomeOrderList
				heading="Home podcasts"
				rows={homePodcastEpisodes.map((homePodcastEpisode) => ({
					id: homePodcastEpisode.id,
					label: toHomePodcastEpisodeLabel(homePodcastEpisode),
					path: homePodcastEpisode.pagePath,
					homeOrder: homePodcastEpisode.homeOrder,
				}))}
				onMove={sendPodcastEpisodeHomeOrder}
				onSaved={onSaved}
			/>
		</section>
	)
}

type HomeOrderListProps = {
	heading: string
	rows: HomeOrderRow[]
	// sends one row's new position, zero to clear it
	onMove: (id: string, position: number) => Promise<void>
	onSaved: () => void
}

// one pin list: its heading, its rows in order, and the line for an empty list
function HomeOrderList({ heading, rows, onMove, onSaved }: HomeOrderListProps) {
	const [movingRowId, setMovingRowId] = useState<string | null>(null)
	// the row whose clear waits for a confirmation
	const [removingRow, setRemovingRow] = useState<HomeOrderRow | null>(null)

	// send one move, then reload the console
	async function handleMove(row: HomeOrderRow, position: number): Promise<void> {
		setMovingRowId(row.id)
		try {
			await onMove(row.id, position)
			onSaved()
		} catch (error) {
			console.error("home order failed", error)
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
					<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{row.homeOrder}</span>
					<AnchorLink href={row.path} className={cn(STANDALONE_LINK_CLASS, "min-w-0 flex-1 truncate")}>
						{row.label}
					</AnchorLink>
					{/* the step buttons at the ends of the list are disabled, and the X clears the pin after a confirmation */}
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Move ${row.label} up`}
						disabled={index === 0 || movingRowId !== null}
						onClick={() => void handleMove(row, row.homeOrder - 1)}
					>
						<ArrowUp className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Move ${row.label} down`}
						disabled={index === rows.length - 1 || movingRowId !== null}
						onClick={() => void handleMove(row, row.homeOrder + 1)}
					>
						<ArrowDown className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Remove ${row.label} from the ${heading.toLowerCase()}`}
						disabled={movingRowId !== null}
						onClick={() => setRemovingRow(row)}
					>
						<X className="size-4" />
					</Button>
				</div>
			))}
			{/* clearing a pin asks first */}
			{removingRow && (
				<ConfirmDialog
					title={`Remove from ${heading.toLowerCase()}?`}
					confirmLabel="Remove"
					cancelLabel="Cancel"
					onConfirm={async () => {
						setRemovingRow(null)
						await handleMove(removingRow, 0)
					}}
					onClose={() => setRemovingRow(null)}
				>
					{removingRow.label} will leave the {heading.toLowerCase()}.
				</ConfirmDialog>
			)}
		</div>
	)
}
