// the team page's Add Topic control: the user's topics that are not on this team yet, ending in the
// row that starts a new one
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendAddTopicTeam } from "@/clients/teamClient"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * Add a topic to the team: attach one the user already has, or open the modal that makes a new one.
 */
export function AddTopicButton({
	teamId,
	addableTopics,
	onTopicAdded,
	onNewTopic,
}: {
	teamId: string
	// the user's topics that this team does not hold yet
	addableTopics: { id: string; name: string }[]
	onTopicAdded: () => void
	onNewTopic: () => void
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [topicFilter, setTopicFilter] = useState("")

	// if no topics can be added the button opens the new modal
	if (addableTopics.length === 0) {
		return (
			<Button className="shrink-0" onClick={onNewTopic}>
				<Plus className="size-4" />
				Add Topic
			</Button>
		)
	}

	// the filtered topics the filter matched case-insensitively
	const filteredTopics = addableTopics.filter((topic) =>
		topic.name.toLowerCase().includes(topicFilter.trim().toLowerCase()),
	)

	// attach the selected topic, then refresh the section behind the menu
	async function handleAddTopic(topic: { id: string; name: string }): Promise<void> {
		setIsOpen(false)
		const rejection = await sendAddTopicTeam(teamId, topic.id)
		if (rejection) {
			toast.error(rejection)
			return
		}
		toast(`Added ${topic.name} to the team.`)
		onTopicAdded()
	}

	// launch the new topic modal from the topics menu
	function handleNewTopic(): void {
		setIsOpen(false)
		onNewTopic()
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button className="shrink-0">
					<Plus className="size-4" />
					Add Topic
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64" bodyClassName="p-1">
				{/* the topics filter and the filtered topics. the popover moves focus here when it opens */}
				<input
					// biome-ignore lint/a11y/noAutofocus: this field is why the panel opens
					autoFocus
					value={topicFilter}
					onChange={(event) => setTopicFilter(event.target.value)}
					placeholder="Search your topics…"
					aria-label="Filter your topics"
					className="placeholder:text-muted-foreground mb-1 w-full bg-transparent px-2 py-1.5 text-sm outline-none"
				/>
				<div className="max-h-56 overflow-y-auto">
					{filteredTopics.map((topic) => (
						<button
							key={topic.id}
							type="button"
							onClick={() => void handleAddTopic(topic)}
							className={MENU_OPTION_CLASS}
						>
							<span className="min-w-0 flex-1 truncate">{topic.name}</span>
						</button>
					))}
				</div>

				{filteredTopics.length === 0 && (
					<p className="text-muted-foreground px-2 py-2 text-sm">No topics matched that name.</p>
				)}

				{/* the new-topic option closes the menu and opens the modal */}
				<button type="button" onClick={handleNewTopic} className={cn(MENU_OPTION_CLASS, "text-link")}>
					<Plus className="size-4 shrink-0" />
					New topic
				</button>
			</PopoverContent>
		</Popover>
	)
}
