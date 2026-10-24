import { authClient } from "@carlnotes/client/authClient"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toSeePlansToastAction } from "@/lib/toastActions"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { TagPicker } from "./TagPicker"
import { useNewTopicDialog } from "./TopicEditorChoiceDialog"

/**
 * The row above a list of topics: the Tags picker with its pills on the left, and the New Topic button on the right,
 * wrapping onto a second line when the screen is too narrow. The tags are the caller's, and the button opens the new
 * topic dialog, whose created topic reloads the topic feed.
 */
export function TagsAndNewTopicRow({ tags, onTagsChange }: { tags: string[]; onTagsChange: (tags: string[]) => void }) {
	// the tags across the feed, the plan's topic quota, and the dialog a created topic reloads the feed behind
	const { topicFeed, knownTags, reloadTopicFeed } = useTopicFeed()
	const { data: session } = authClient().useSession()
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog(() => void reloadTopicFeed())
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="flex min-w-0 flex-wrap items-center gap-1.5">
				<TagPicker tags={tags} knownTags={knownTags} openPickerLabel="Tags:" onTagsChange={onTagsChange} />
			</div>
			<NewTopicButton
				remainingTopics={topicFeed?.topicsRemaining ?? null}
				topicLimit={topicFeed?.topicLimit ?? null}
				isSignedIn={Boolean(session)}
				onNewTopic={openNewTopicDialog}
			/>
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
		</div>
	)
}

// the "+ New Topic" button and remaining topic quota
function NewTopicButton({
	remainingTopics,
	topicLimit,
	isSignedIn,
	onNewTopic,
}: {
	remainingTopics: number | null
	// the plan's topic limit, or null while the feed loads
	topicLimit: number | null
	isSignedIn: boolean
	onNewTopic: () => void
}) {
	const navigate = useNavigate()

	// a logged-out visitor is shown a sign-up button, and a user at their limit is told so instead of meeting a dead button
	const isAtLimit = isSignedIn && remainingTopics !== null && remainingTopics <= 0
	const limitLine = `That's all ${topicLimit ?? 0} topics. Carl needs a little pick-me-up to read more.`
	const quotaLine =
		isSignedIn && remainingTopics !== null && topicLimit !== null
			? topicLimit >= ADMIN_QUOTA
				? "Unlimited topics"
				: `${remainingTopics} of ${topicLimit} topics left`
			: null
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="sm"
					onClick={isAtLimit ? () => toast(limitLine, { action: toSeePlansToastAction(navigate) }) : onNewTopic}
					disabled={isSignedIn && remainingTopics === null}
					className="min-h-11 shrink-0 gap-1.5 rounded-lg sm:min-h-9"
				>
					<Plus className="size-4" />
					New Topic
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				You know the one...
				{quotaLine && <span className="block">{quotaLine}</span>}
			</TooltipContent>
		</Tooltip>
	)
}
