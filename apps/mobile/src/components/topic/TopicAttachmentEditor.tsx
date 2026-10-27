import { uploadTopicAttachmentBody } from "@carlnotes/client/topicClient"
import { MAX_ATTACHMENT_CONTEXT_CHARS, type TopicDetails } from "@carlnotes/contracts/topics"
import type { TopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { type DocumentPickerAsset, getDocumentAsync } from "expo-document-picker"
import { ChevronDown, ChevronRight, Paperclip, X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { usePageMutation } from "@/hooks/usePageMutation"
import { TopicAttachmentLink } from "./TopicAttachmentLink"
import { SafeNoteText } from "./TopicScanRecap"

export type TopicAttachmentFile = DocumentPickerAsset

/**
 * Stages native files and attachment context edits for the shared Topic save.
 */
export function TopicAttachmentEditor({ fields }: { fields: TopicFields<TopicAttachmentFile> }) {
	const mutation = usePageMutation()
	return (
		<View className="gap-2">
			{fields.keptAttachments.map((attachment) => (
				<View key={attachment.id} className="gap-2">
					<View className="flex-row items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							accessibilityLabel={`Remove ${attachment.filename}`}
							onPress={() =>
								fields.setKeptAttachments(fields.keptAttachments.filter((kept) => kept.id !== attachment.id))
							}
						>
							<Icon as={X} className="size-4" />
						</Button>
						<TopicAttachmentLink attachment={attachment} isTopicOwner />
					</View>
					<AttachmentContext
						attachment={attachment}
						onContextChange={(context) =>
							fields.setKeptAttachments(
								fields.keptAttachments.map((kept) => (kept.id === attachment.id ? { ...kept, context } : kept)),
							)
						}
					/>
				</View>
			))}
			{fields.pendingFiles.map((file) => (
				<View key={file.uri} className="flex-row items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						accessibilityLabel={`Remove ${file.name}`}
						onPress={() => fields.setPendingFiles((files) => files.filter((pending) => pending !== file))}
					>
						<Icon as={X} className="size-4" />
					</Button>
					<Text className="flex-1 text-sm">{file.name}</Text>
				</View>
			))}
			<Button
				variant="link"
				className="self-start px-0"
				accessibilityLabel="Add files or photos"
				disabled={mutation.isPending}
				onPress={() => void mutation.run(() => pickTopicAttachments(fields))}
			>
				<Icon as={Paperclip} className="size-4" />
				<Text>add an attachment</Text>
			</Button>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

/**
 * Stages files from the native picker for either attachment action.
 */
export async function pickTopicAttachments(fields: TopicFields<TopicAttachmentFile>): Promise<void> {
	// keep the accepted file formats aligned with the browser picker
	const selection = await getDocumentAsync({
		multiple: true,
		copyToCacheDirectory: true,
		type: [
			"image/*",
			"text/*",
			"application/pdf",
			"application/json",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		],
	})
	if (selection.canceled) {
		return
	}
	fields.setPendingFiles((files) => {
		const addedFiles = selection.assets.filter(
			(asset) =>
				!files.some(
					(file) => file.name === asset.name && file.size === asset.size && file.lastModified === asset.lastModified,
				),
		)
		return [...files, ...addedFiles]
	})
}

/**
 * Sends a native file descriptor through the shared attachment endpoint.
 */
export async function uploadTopicAttachment(topicId: string, file: TopicAttachmentFile): Promise<void> {
	const body = new FormData()
	body.append("file", {
		uri: file.uri,
		name: file.name,
		type: file.mimeType ?? "application/octet-stream",
	} as unknown as Blob)
	await uploadTopicAttachmentBody(topicId, body)
}

// read the generated attachment context before editing
function AttachmentContext({
	attachment,
	onContextChange,
}: {
	attachment: TopicDetails["attachments"][number]
	onContextChange: (context: string) => void
}) {
	const [isExpanded, setIsExpanded] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	if (attachment.status !== "ready" || attachment.context === null) {
		const statusLabel =
			attachment.status === "pending"
				? "Carl is still reading this one…"
				: (attachment.failureMessage ?? "Carl couldn't read this one.")
		return <Text className="text-xs text-muted-foreground">{statusLabel}</Text>
	}
	return (
		<View className="gap-1">
			<Button
				variant="link"
				className="self-start"
				accessibilityLabel={`Content of ${attachment.filename}`}
				accessibilityState={{ expanded: isExpanded }}
				onPress={() => setIsExpanded(!isExpanded)}
			>
				<Icon as={isExpanded ? ChevronDown : ChevronRight} className="size-3.5" />
				<Text>content</Text>
			</Button>
			{isExpanded && (
				<>
					{isEditing ? (
						<SessionTextInput
							label={`Context for ${attachment.filename}`}
							isLabelVisible={false}
							multiline
							className="min-h-32"
							maxLength={MAX_ATTACHMENT_CONTEXT_CHARS}
							value={attachment.context}
							onChangeText={onContextChange}
						/>
					) : (
						<ScrollBox>
							<SafeNoteText note={attachment.context} />
						</ScrollBox>
					)}
					<View className="flex-row items-start justify-between gap-2">
						<Text className="flex-1 text-xs text-muted-foreground">
							What Carl read from the file. Every brew reads it. Edit wisely.
						</Text>
						<Button
							variant="link"
							className="shrink-0 px-0"
							accessibilityLabel={`${isEditing ? "Finish editing" : "Edit"} context for ${attachment.filename}`}
							onPress={() => setIsEditing(!isEditing)}
						>
							<Text>{isEditing ? "done" : "edit"}</Text>
						</Button>
					</View>
				</>
			)}
		</View>
	)
}
