import { toTestSharedComments } from "@carlnotes/contracts/socialTestFixtures"
import type { TopicPersonalSourcesContentsState } from "../hooks/useTopicPersonalSourcesContents"
import { PERSONAL_SOURCES_CONVERSATION_EXAMPLES } from "../lib/personalSourcesConversationStories"
import { toPersonalSourceSenderIdentity, toPersonalSourcesSectionTitle } from "../lib/personalSourcesCopy"
import { PERSONAL_SOURCES_TOPIC_STORY, useTopicPersonalSourcesStory } from "../lib/personalSourcesStories"
import { PersonalSourcesEmailAddress } from "./PersonalSourcesEmailAddress"
import type { TopicPersonalSourcesElements } from "./TopicPersonalSources"
import { TopicPersonalSourcesContents } from "./TopicPersonalSourcesContents"
import { SharedCommentsGroup } from "./TopicSharedCommentsSection"

type TopicPersonalSourcesSectionStoryProps = {
	elements: TopicPersonalSourcesElements
	variant?: Parameters<typeof useTopicPersonalSourcesStory>[0]
	initialOpen?: boolean
	isEntryExpanded?: boolean
	isPlatformGallery?: boolean
	conversationExample?: keyof typeof PERSONAL_SOURCES_CONVERSATION_EXAMPLES
	canContribute?: boolean
	// whether the Hot takes group lists two shared comments under the section
	hasSharedComments?: boolean
	className?: string
}

/**
 * Shares interactive section fixtures for both surfaces and platforms.
 */
export function TopicPersonalSourcesSectionStory({
	initialOpen = true,
	className,
	...props
}: TopicPersonalSourcesSectionStoryProps) {
	// keep the fixture header and item list in sync after deletion
	const state = useTopicPersonalSourcesStory(props.variant, props.conversationExample)
	const entryCount = state.totalEntryCount ?? 0
	if (props.isPlatformGallery) {
		return <ConversationPlatforms elements={props.elements} />
	}
	if (entryCount === 0) {
		return null
	}
	return (
		<>
			<props.elements.Row className={className}>
				<props.elements.ExpandableRow
					title={toPersonalSourcesSectionTitle(entryCount)}
					metadata="Only you can see this"
					variant="section"
					initialOpen={initialOpen}
					isLast
				>
					<Contents {...props} state={state} />
				</props.elements.ExpandableRow>
			</props.elements.Row>
			{props.hasSharedComments && (
				<SharedCommentsGroup
					sharedComments={SHARED_COMMENTS_STORY}
					elements={props.elements}
					className={className}
					initialOpen={initialOpen}
				/>
			)}
		</>
	)
}

// two shared comments, one by Carl
const SHARED_COMMENTS_STORY = toTestSharedComments(`/topics/${PERSONAL_SOURCES_TOPIC_STORY.id}`)

// render the current fixture page through the same content component as the live view
function Contents({
	elements,
	state,
	isEntryExpanded = false,
	canContribute = true,
}: Omit<TopicPersonalSourcesSectionStoryProps, "initialOpen"> & { state: TopicPersonalSourcesContentsState }) {
	return (
		<TopicPersonalSourcesContents
			topic={PERSONAL_SOURCES_TOPIC_STORY}
			state={state}
			canContribute={canContribute}
			elements={elements}
			initialExpandedEntryId={isEntryExpanded ? state.page?.entries[0]?.id : undefined}
			emptyControls={
				<PersonalSourcesEmailAddress address="carl@example.com" elements={elements} onCopy={async () => true} />
			}
		/>
	)
}

// render each conversation reference through the production sender metadata adapter
function ConversationPlatforms({ elements }: Pick<TopicPersonalSourcesSectionStoryProps, "elements">) {
	const { Row, Text, Sender } = elements
	return (
		<Row className="space-y-4 gap-4">
			{Object.values(PERSONAL_SOURCES_CONVERSATION_EXAMPLES).map(({ label, href }) => (
				<Row key={label} className="space-y-1 gap-1">
					<Text className="text-xs text-muted-foreground">{label}</Text>
					<Sender
						date="2026-11-04"
						kind="send"
						chatUrl={href ?? undefined}
						{...toPersonalSourceSenderIdentity({ sender: label, origin: "send", chatUrl: href })}
					/>
				</Row>
			))}
		</Row>
	)
}
