import { authClient } from "@carlnotes/client/authClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PersonalSourceLinkOutcome } from "@carlnotes/contracts/personalSources"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { type ComponentType, type ReactNode, useEffect, useState } from "react"
import { useTopicFindingActions } from "../hooks/useTopicFindingActions"
import { applyFindingChange, applyFindingChanges } from "../lib/topicFindingChanges"
import type { TopicLinkedFindingDetailsProps } from "./TopicLinkedFinding"

export type PersonalSourceLinkProps = {
	topic: TopicDetails
	url: string
	outcome?: PersonalSourceLinkOutcome
}
export type PersonalSourceLinkElements = {
	Row: ComponentType<{ children: ReactNode }>
	SourceLink: ComponentType<{ url: string; label: string }>
	Pending: ComponentType<{ children: ReactNode }>
	FindingFrame: ComponentType<{
		isOpen: boolean
		onOpenChange: (isOpen: boolean) => void
		label: string
		children: ReactNode
	}>
	FindingDetails: ComponentType<TopicLinkedFindingDetailsProps>
}

/**
 * Opens a kept Finding in place, or the original page with its pending status.
 */
export function PersonalSourceLink({
	topic,
	url,
	outcome,
	elements,
}: PersonalSourceLinkProps & { elements: PersonalSourceLinkElements }) {
	// resolve only Findings in the current authorized Topic payload
	const resource =
		outcome?.status === "finding"
			? topic.findings.find((finding) => finding.findingId === outcome.findingId)
			: undefined
	const label = outcome?.title?.trim() || resource?.title?.trim() || url
	if (resource) {
		return <FindingLink key={resource.findingId} topic={topic} resource={resource} label={label} elements={elements} />
	}
	return (
		<elements.Row>
			<elements.SourceLink url={url} label={label} />
			{(!outcome || outcome.status === "queued") && <elements.Pending>Next brew</elements.Pending>}
		</elements.Row>
	)
}

// keep popup selection local so opening and closing preserve the surrounding list
function FindingLink({
	topic,
	resource,
	label,
	elements,
}: {
	topic: TopicDetails
	resource: TopicFinding
	label: string
	elements: PersonalSourceLinkElements
}) {
	// retain confirmed action state until this item leaves the list
	const [isOpen, setIsOpen] = useState(false)
	const { data: session } = authClient().useSession()
	const [confirmedResource, setConfirmedResource] = useState(resource)
	useEffect(() => setConfirmedResource(resource), [resource])
	const actions = useTopicFindingActions({
		userId: session?.user.id ?? null,
		shouldUpdateOptimistically: true,
		onChangeConfirmed: (change) =>
			setConfirmedResource((currentResource) => applyFindingChange(currentResource, change)),
	})
	return (
		<elements.FindingFrame isOpen={isOpen} onOpenChange={setIsOpen} label={label}>
			{isOpen && (
				<elements.FindingDetails
					topic={topic}
					resource={applyFindingChanges(confirmedResource, actions.pendingChanges)}
					topicFeedHandlers={actions.handlers}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</elements.FindingFrame>
	)
}
