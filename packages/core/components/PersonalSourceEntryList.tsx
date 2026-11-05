import type { PersonalSourceEntry, PersonalSourceEntryPage } from "@carlnotes/contracts/personalSources"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { type ComponentProps, type ComponentType, type ReactNode, useState } from "react"
import {
	type PersonalSourceConversationProvider,
	toPersonalSourceDate,
	toPersonalSourceSenderIdentity,
} from "../lib/personalSourcesCopy"
import type { AccountFieldElements } from "./AccountFields"
import type { ExpandableRowProps } from "./ExpandableRow"
import type { PersonalSourceLinkProps } from "./PersonalSourceLink"

export type PersonalSourceEntryElements = Pick<AccountFieldElements, "Group" | "Text"> & {
	Row: AccountFieldElements["Group"]
	ExpandableRow: ComponentType<ExpandableRowProps>
	PersonalSourceLink: ComponentType<PersonalSourceLinkProps>
	Sender: ComponentType<{
		date: string
		label: string
		kind: PersonalSourceEntry["origin"]
		chatUrl?: string
		provider: PersonalSourceConversationProvider
	}>
	Loading: ComponentType
	Pagination: ComponentType<{ pageNumber: number; pageCount: number; onOpenPage: (pageNumber: number) => void }>
	Button: ComponentType<
		ComponentProps<AccountFieldElements["Button"]> & {
			isExpanded?: boolean
			isDestructive?: boolean
			accessibilityLabel?: string
		}
	>
	Link: ComponentType<{
		href: string
		children: ReactNode
		onPress?: () => void
	}>
}
type PersonalSourceEntryListProps = {
	topic: TopicDetails
	elements: PersonalSourceEntryElements
	page?: PersonalSourceEntryPage
	entryOffset: number
	isLoading: boolean
	hasError: boolean
	isPending: boolean
	pageNumber: number
	pageCount: number
	onRetry: () => void
	onOpenPage: (pageNumber: number) => void
	onDelete: (entry: PersonalSourceEntry) => void
}

/**
 * Lists a bounded page of private entries with shared retention, detail, and pagination controls.
 */
export function PersonalSourceEntryList({
	topic,
	elements,
	page,
	entryOffset,
	isLoading,
	hasError,
	isPending,
	pageNumber,
	pageCount,
	onRetry,
	onOpenPage,
	onDelete,
}: PersonalSourceEntryListProps) {
	// show retained items from the current sender-authorized page
	const { Group, Row, Text, Button, Loading, Pagination } = elements
	const entries = page?.entries ?? []
	return (
		<Row className="min-w-0">
			{/* loading and empty states never reveal a previous page's text */}
			<Row className="space-y-3 gap-3">
				{isLoading && <Loading />}
				{hasError && (
					<Group>
						<Text>Could not load items.</Text>
						<Button label="Try again" onPress={onRetry} />
					</Group>
				)}
				{!isLoading && !hasError && entries.length === 0 && <Text>No entries here.</Text>}
				{!isLoading &&
					!hasError &&
					entries.map((entry, index) => (
						<Entry
							key={entry.id}
							topic={topic}
							elements={elements}
							entry={entry}
							ordinal={entryOffset + index + 1}
							isFirst={index === 0}
							isLast={index === entries.length - 1}
							isPending={isPending}
							onDelete={() => onDelete(entry)}
						/>
					))}
			</Row>
			{/* retain only one page of entries in the mounted list */}
			{!isLoading && !hasError && pageCount > 1 && (
				<Row className="pb-2">
					<Pagination pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
				</Row>
			)}
		</Row>
	)
}

// show one text segment at a time for large imports while preserving every selected character
function Entry({
	topic,
	elements,
	entry,
	ordinal,
	isFirst,
	isLast,
	isPending,
	onDelete,
}: {
	topic: TopicDetails
	elements: PersonalSourceEntryElements
	entry: PersonalSourceEntry
	ordinal: number
	isFirst: boolean
	isLast: boolean
	isPending: boolean
	onDelete: () => void
}) {
	const { ExpandableRow } = elements
	return (
		<ExpandableRow
			title={entry.title}
			metadata={toPersonalSourceDate(entry.receivedAt)}
			isFirst={isFirst}
			isLast={isLast}
			ordinal={ordinal}
		>
			<EntryDetails topic={topic} elements={elements} entry={entry} isPending={isPending} onDelete={onDelete} />
		</ExpandableRow>
	)
}

// release the expanded transcript and its text position when the row collapses
function EntryDetails({
	topic,
	elements,
	entry,
	isPending,
	onDelete,
}: {
	topic: TopicDetails
	elements: PersonalSourceEntryElements
	entry: PersonalSourceEntry
	isPending: boolean
	onDelete: () => void
}) {
	const { Group, Row, Text, Button, Sender } = elements
	const [textPage, setTextPage] = useState(0)
	const senderIdentity = toPersonalSourceSenderIdentity(entry)
	const textPageCount = Math.max(1, Math.ceil(entry.text.length / 4000))
	return (
		<Row className="space-y-3 gap-3">
			<elements.Row className="flex flex-row items-center justify-between gap-3">
				<elements.Row className="min-w-0 flex-1 space-y-2 gap-2">
					<Sender
						date={entry.receivedAt.slice(0, 10)}
						label={senderIdentity.label}
						kind={entry.origin}
						chatUrl={entry.chatUrl ?? undefined}
						provider={senderIdentity.provider}
					/>
				</elements.Row>
				<Button
					label="Delete"
					accessibilityLabel={`Delete ${entry.title}`}
					isDestructive
					isDisabled={isPending}
					onPress={onDelete}
				/>
			</elements.Row>
			<Group>
				<Text className="whitespace-pre-wrap break-words text-sm">
					{entry.text.slice(textPage * 4000, (textPage + 1) * 4000)}
				</Text>
				{textPageCount > 1 && <Text>{`Text part ${textPage + 1} of ${textPageCount}`}</Text>}
				{textPage > 0 && <Button label="Previous text part" onPress={() => setTextPage(textPage - 1)} />}
				{textPage + 1 < textPageCount && <Button label="Next text part" onPress={() => setTextPage(textPage + 1)} />}
				{entry.links.map((url) => (
					<elements.PersonalSourceLink
						key={url}
						topic={topic}
						url={url}
						outcome={entry.linkOutcomes.find((link) => link.url === url)}
					/>
				))}
				{entry.omittedLinkCount > 0 && <Text>{`${entry.omittedLinkCount} additional links were not queued.`}</Text>}
			</Group>
		</Row>
	)
}
