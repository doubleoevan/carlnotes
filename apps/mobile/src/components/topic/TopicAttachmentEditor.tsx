import { appendNativeFilePart, showClientError } from "@carlnotes/client/apiClient"
import { uploadTopicAttachmentBody } from "@carlnotes/client/topicClient"
import {
	TOPIC_ATTACHMENT_ACCEPT,
	TOPIC_ATTACHMENT_MAX_BYTES,
	TOPIC_ATTACHMENT_TOO_LARGE_LINE,
} from "@carlnotes/contracts/attachmentTypes"
import { MAX_ATTACHMENT_CONTEXT_CHARS, type TopicDetails } from "@carlnotes/contracts/topics"
import type { TopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { toCurrentChatAccountGuard } from "@carlnotes/core/stores/chatConversationStore"
import { ChevronDown, ChevronRight, Paperclip, X } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { useFilePicker } from "@/components/common/FilePickerMenu"
import { deletePickedFile, toReadablePickedFile } from "@/components/common/pickedFileCache"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { type PickedFile, toPreparedPickedFiles } from "@/pickedFiles"
import { TopicAttachmentLink } from "./TopicAttachmentLink"
import { SafeNoteText } from "./TopicScanRecap"

export type TopicAttachmentFile = PickedFile

/**
 * Stages native files and attachment context edits for the shared Topic save.
 */
export function TopicAttachmentEditor({ fields }: { fields: TopicFields<TopicAttachmentFile> }) {
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
						onPress={() => {
							fields.setPendingFiles((files) => files.filter((pendingFile) => pendingFile !== file))
							deletePickedFile(file)
						}}
					>
						<Icon as={X} className="size-4" />
					</Button>
					<Text className="flex-1 text-sm">{file.name}</Text>
				</View>
			))}
			<TopicAttachButton fields={fields} variant="link" />
		</View>
	)
}

/**
 * Opens the picker menu for a topic's attachments, as a paperclip beside the prompt or a link under the attachments.
 * Images are resized, a file over the topic limit is rejected before upload, and a file already staged is not staged
 * twice.
 */
export function TopicAttachButton({
	fields,
	variant,
}: {
	fields: TopicFields<TopicAttachmentFile>
	variant: "icon" | "link"
}) {
	const { openFilePicker, filePickerMenu, isPicking, triggerRef } = useFilePicker({
		accept: TOPIC_ATTACHMENT_ACCEPT,
		isMultiple: true,
		onPicked: async (pickedFiles) => {
			// prepare the files for the account that picked them, then stage the ones not already staged
			const preparedFiles = await toPreparedPickedFiles({
				pickedFiles,
				prepare: toTopicAttachmentFile,
				isSameAccount: toCurrentChatAccountGuard(),
				deleteFile: deletePickedFile,
			})
			const isStaged = (preparedFile: PickedFile): boolean =>
				fields.pendingFiles.some((file) => file.name === preparedFile.name && file.byteSize === preparedFile.byteSize)
			// a file already staged keeps its first copy, and the second is deleted
			for (const preparedFile of preparedFiles.filter(isStaged)) {
				deletePickedFile(preparedFile)
			}
			fields.setPendingFiles((files) => [...files, ...preparedFiles.filter((preparedFile) => !isStaged(preparedFile))])
		},
	})
	return (
		<>
			<Button
				ref={triggerRef}
				variant={variant === "icon" ? "ghost" : "link"}
				size={variant === "icon" ? "icon" : undefined}
				className={variant === "link" ? "self-start px-0" : undefined}
				accessibilityLabel="Add files or photos"
				disabled={isPicking}
				onPress={openFilePicker}
			>
				<Icon as={Paperclip} className="size-4" />
				{variant === "link" && <Text>add an attachment</Text>}
			</Button>
			{filePickerMenu}
		</>
	)
}

/**
 * Deletes the staged files' copies when the topic form closes. An uploaded file's copy is already gone.
 */
export function useTopicAttachmentCleanup(pendingFiles: TopicAttachmentFile[]): void {
	const pendingFilesRef = useRef(pendingFiles)
	pendingFilesRef.current = pendingFiles
	useEffect(
		() => () => {
			for (const pendingFile of pendingFilesRef.current) {
				deletePickedFile(pendingFile)
			}
		},
		[],
	)
}

/**
 * Sends a native file descriptor through the shared attachment endpoint.
 */
export async function uploadTopicAttachment(topicId: string, file: TopicAttachmentFile): Promise<void> {
	const body = new FormData()
	appendNativeFilePart(body, "file", {
		uri: file.uri,
		name: file.name,
		type: file.mimeType || "application/octet-stream",
	})
	await uploadTopicAttachmentBody(topicId, body)
}

// a picked file resized if it is an image, or null after a notice if it cannot be read or is over the topic limit. a
// document's size is checked before anything reads it
async function toTopicAttachmentFile(pickedFile: PickedFile): Promise<PickedFile | null> {
	const readableFile = await toReadablePickedFile(pickedFile)
	if (!readableFile) {
		return null
	}
	if (readableFile.byteSize > TOPIC_ATTACHMENT_MAX_BYTES) {
		deletePickedFile(readableFile)
		showClientError(TOPIC_ATTACHMENT_TOO_LARGE_LINE)
		return null
	}
	return readableFile
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
