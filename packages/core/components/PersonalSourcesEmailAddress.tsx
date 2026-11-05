import { useState } from "react"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"

type PersonalSourcesEmailAddressProps = {
	address: string
	elements: Pick<AiAgentAccountElements, "Text" | "Button"> & { Row: AiAgentAccountElements["Group"] }
	onCopy: (text: string) => Promise<boolean>
}

/**
 * Shows Carl's address as a compact empty-state hint with clipboard feedback.
 */
export function PersonalSourcesEmailAddress({ address, elements, onCopy }: PersonalSourcesEmailAddressProps) {
	// report clipboard failure without losing the selectable address
	const { Row, Text, Button } = elements
	const [copyResult, setCopyResult] = useState<boolean | null>(null)
	const handleCopy = async (): Promise<void> => {
		setCopyResult(await onCopy(address).catch(() => false))
	}
	return (
		<Row className="min-w-0">
			<Row className="flex flex-row flex-wrap items-center gap-2">
				<Text className="min-w-0 shrink text-sm">{`Email Carl at ${address}.`}</Text>
				<Button label={copyResult ? "Copied" : "Copy"} onPress={handleCopy} />
			</Row>
			{copyResult === false && <Text>Could not copy. Select the address and copy it manually.</Text>}
		</Row>
	)
}
