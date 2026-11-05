import type { TopicDetails } from "@carlnotes/contracts/topics"
import type { ReactNode } from "react"
import type { TopicPersonalSourcesContentsState } from "../hooks/useTopicPersonalSourcesContents"
import { PersonalSourceEntryList } from "./PersonalSourceEntryList"
import type { TopicPersonalSourcesElements } from "./TopicPersonalSources"

type TopicPersonalSourcesContentsProps = {
	topic: TopicDetails
	state: TopicPersonalSourcesContentsState
	elements: TopicPersonalSourcesElements
	emptyControls?: ReactNode
	canContribute?: boolean
}

/**
 * Shares the item disclosure list and empty-state guidance on all platforms.
 */
export function TopicPersonalSourcesContents({
	topic,
	state,
	elements,
	emptyControls,
	canContribute = true,
}: TopicPersonalSourcesContentsProps) {
	// empty guidance and populated history share the same sender-only presentation
	const { Row, Heading, Text, Link, Confirm, Loading } = elements
	const isEmpty = state.totalEntryCount === 0 && !state.isLoading && !state.hasError
	if (state.isLoading) {
		return <Loading />
	}
	return (
		<Row className="min-w-0 space-y-2 gap-2">
			{!canContribute && <Text>You can review or delete your items. Sending requires Topic edit access.</Text>}
			{isEmpty && !canContribute ? (
				<Text>No Personal sources items remain.</Text>
			) : isEmpty ? (
				<>
					<Text className="text-sm">
						{
							"Nothing sent yet. Send Carl what you're working on, and he'll use it to pick and explain this topic's findings."
						}
					</Text>
					<Row className="space-y-3 gap-3">
						<Heading>From Claude or ChatGPT</Heading>
						<Text>Connect CarlNotes, then ask:</Text>
						<Text>{'"Send a summary of this conversation to Carl."'}</Text>
						<Link href="/docs/account/add-to-ai/">How to connect</Link>
					</Row>
					{emptyControls}
				</>
			) : (
				<PersonalSourceEntryList
					topic={topic}
					elements={elements}
					page={state.page}
					entryOffset={state.entryOffset}
					isLoading={state.isLoading}
					hasError={state.hasError}
					isPending={state.isPending}
					pageNumber={state.pageNumber}
					pageCount={state.pageCount}
					onRetry={state.retry}
					onOpenPage={state.openPage}
					onDelete={state.removeEntry}
				/>
			)}
			{/* delete only after confirmation and preserve the row on a failed request */}
			{state.error && <Text className="text-destructive">{state.error}</Text>}
			{state.confirmation && (
				<Confirm
					title={`Delete ${state.confirmation.title}?`}
					confirmLabel="Delete item"
					cancelLabel="Cancel"
					onConfirm={state.confirm}
					onClose={state.cancel}
				>
					This deletes the item and its waiting links and rebuilds private context. Existing Findings remain.
				</Confirm>
			)}
		</Row>
	)
}
