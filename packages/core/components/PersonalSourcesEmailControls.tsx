import { fetchPersonalSourcesEmailSetup } from "@carlnotes/client/personalSourcesClient"
import { useQuery } from "@tanstack/react-query"
import type { ComponentProps } from "react"
import { PersonalSourcesEmailAddress } from "./PersonalSourcesEmailAddress"

type PersonalSourcesEmailControlsProps = {
	userId: string
	topicId: string
	elements: ComponentProps<typeof PersonalSourcesEmailAddress>["elements"]
	onCopy: (text: string) => Promise<boolean>
}

/**
 * Loads Carl's shared mailbox only for the Personal sources empty-state hint.
 */
export function PersonalSourcesEmailControls({ userId, topicId, elements, onCopy }: PersonalSourcesEmailControlsProps) {
	// read the configured mailbox without creating a receiving Source
	const { Row, Text, Button } = elements
	const email = useQuery({
		queryKey: ["personal-sources-email", userId, topicId],
		queryFn: ({ signal }) => fetchPersonalSourcesEmailSetup(topicId, signal),
		gcTime: 0,
	})
	return (
		<Row className="min-w-0">
			{email.isPending && <Text>Loading Carl's address…</Text>}
			{email.isError && (
				<Row className="min-w-0">
					<Text>Could not load Carl's address.</Text>
					<Button
						label="Retry address"
						onPress={() => {
							void email.refetch()
						}}
					/>
				</Row>
			)}
			{email.data?.address && (
				<PersonalSourcesEmailAddress address={email.data.address} elements={elements} onCopy={onCopy} />
			)}
		</Row>
	)
}
