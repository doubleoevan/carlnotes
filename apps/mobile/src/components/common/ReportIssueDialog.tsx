import { sendFlagContent } from "@carlnotes/client/flagContentClient"
import { FLAG_REASON_MAX_CHARS } from "@carlnotes/contracts/chat"
import type { FlagContentPayload } from "@carlnotes/contracts/payloads"
import type { ReportUser } from "@carlnotes/contracts/reports"
import { REPORT_DIALOG_COPY, toReportDialogTitle } from "@carlnotes/core/lib/reportCopy"
import { toBlockAuthorLabel } from "@carlnotes/core/lib/userBlocks"
import { useState } from "react"
import { Alert, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { usePageMutation } from "@/hooks/usePageMutation"
import { PreferenceSwitch } from "./PreferenceSwitch"
import { Sheet } from "./Sheet"

// what a report names: its subject, and the subject's author if a report can block them
export type ReportSubject = Pick<FlagContentPayload, "subjectKind" | "subjectId"> & {
	subjectLabel: string
	author?: ReportUser
}

/**
 * Sends the same issue report as the web, keeping rejected text available to retry.
 */
export function ReportIssueDialog({ subjectLabel, ...props }: ReportSubject & { onClose: () => void }) {
	return (
		<Sheet title={toReportDialogTitle(subjectLabel)} onClose={props.onClose}>
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
	author,
	onClose,
}: Omit<ReportSubject, "subjectLabel"> & { onClose: () => void }) {
	const [reason, setReason] = useState("")
	const [shouldBlockAuthor, setIsAuthorBlocked] = useState(false)
	const mutation = usePageMutation()
	return (
		<View className="gap-4">
			<Text className="text-sm text-muted-foreground">{REPORT_DIALOG_COPY.question}</Text>
			<SessionTextInput
				label={REPORT_DIALOG_COPY.reasonLabel}
				isLabelVisible={false}
				value={reason}
				onChangeText={setReason}
				multiline
				maxLength={FLAG_REASON_MAX_CHARS}
				className="min-h-24"
			/>
			{/* the author's block, in the same submission */}
			{author && (
				<PreferenceSwitch
					label={toBlockAuthorLabel(author.username)}
					isChecked={shouldBlockAuthor}
					onChange={() => setIsAuthorBlocked((isBlocked) => !isBlocked)}
				/>
			)}
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			<View className="flex-row justify-end gap-2">
				<Button variant="ghost" accessibilityLabel={REPORT_DIALOG_COPY.cancel} onPress={onClose}>
					<Text>{REPORT_DIALOG_COPY.cancel}</Text>
				</Button>
				<Button
					accessibilityLabel={REPORT_DIALOG_COPY.send}
					disabled={mutation.isPending}
					onPress={() =>
						void mutation.run(async () => {
							await sendFlagContent({ subjectKind, subjectId, reason: reason.trim(), shouldBlockAuthor })
							onClose()
							Alert.alert(shouldBlockAuthor ? REPORT_DIALOG_COPY.sentWithBlock : REPORT_DIALOG_COPY.sent)
						})
					}
				>
					<Text>{mutation.isPending ? REPORT_DIALOG_COPY.sending : REPORT_DIALOG_COPY.send}</Text>
				</Button>
			</View>
		</View>
	)
}
