import { sendFlagContent } from "@carlnotes/client/flagContentClient"
import { FLAG_REASON_MAX_CHARS } from "@carlnotes/contracts/chat"
import type { FlagContentPayload } from "@carlnotes/contracts/payloads"
import { useState } from "react"
import { Alert, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { usePageMutation } from "@/hooks/usePageMutation"
import { Sheet } from "./Sheet"

export type ReportSubject = Pick<FlagContentPayload, "subjectKind" | "subjectId"> & { subjectLabel: string }

/**
 * Sends the same issue report as the web, keeping rejected text available to retry.
 */
export function ReportIssueDialog({ subjectLabel, ...props }: ReportSubject & { onClose: () => void }) {
	return (
		<Sheet title={`Report an issue with ${subjectLabel}`} onClose={props.onClose}>
			<ReportIssueForm {...props} />
		</Sheet>
	)
}

/**
 * Reuses the report form inside an already open sheet without replacing its native presentation.
 */
export function ReportIssueForm({
	subjectKind,
	subjectId,
	onClose,
}: Omit<ReportSubject, "subjectLabel"> & { onClose: () => void }) {
	const [reason, setReason] = useState("")
	const mutation = usePageMutation()
	return (
		<View className="gap-4">
			<Text className="text-sm text-muted-foreground">What is wrong with it?</Text>
			<SessionTextInput
				label="Why you are reporting this"
				isLabelVisible={false}
				value={reason}
				onChangeText={setReason}
				multiline
				maxLength={FLAG_REASON_MAX_CHARS}
				className="min-h-24"
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			<View className="flex-row justify-end gap-2">
				<Button variant="ghost" accessibilityLabel="Cancel" onPress={onClose}>
					<Text>Cancel</Text>
				</Button>
				<Button
					accessibilityLabel="Send report"
					disabled={mutation.isPending || !reason.trim()}
					onPress={() =>
						void mutation.run(async () => {
							await sendFlagContent({ subjectKind, subjectId, reason: reason.trim() })
							onClose()
							Alert.alert("Thanks for your report. Someone will take a look.")
						})
					}
				>
					<Text>{mutation.isPending ? "Sending…" : "Send report"}</Text>
				</Button>
			</View>
		</View>
	)
}
