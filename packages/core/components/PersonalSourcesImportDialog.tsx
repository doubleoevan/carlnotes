import type { PersonalSourcesImportConversation } from "@carlnotes/contracts/personalSourcesPayloads"
import { type ComponentType, type ReactNode, useState } from "react"
import { PERSONAL_SOURCES_IMPORT_NOTICE, PERSONAL_SOURCES_PRIVACY_NOTICE } from "../lib/personalSourcesCopy"
import type { AccountFieldElements } from "./AccountFields"

// browser parsing supplies data and actions; presentation and selection stay portable
export type PersonalSourcesImportController = {
	state:
		| { status: "idle" | "parsing" }
		| {
				status: "preview"
				preview: { conversations: (PersonalSourcesImportConversation & { createdAt: string | null })[] }
		  }
	error: string | null
	isImporting: boolean
	parseText: (input: { title: string; text: string }) => void
	reset: () => void
	importSelected: (selectedIds: Set<string>) => Promise<boolean>
}
export type PersonalSourcesImportDialogElements = Pick<AccountFieldElements, "Group" | "Text"> & {
	Button: ComponentType<{
		label: string
		onPress: () => void
		isDisabled?: boolean
		variant?: "outline" | "ghost" | "default"
	}>
	Status: ComponentType<{ children: ReactNode; isError?: boolean }>
	Dialog: ComponentType<{
		title: string
		description: string
		children: ReactNode
		onClose: () => void
		isCloseDisabled: boolean
	}>
	Field?: ComponentType<{
		label: string
		value: string
		onChange: (value: string) => void
		isMultiline?: boolean
		placeholder?: string
		maxLength?: number
	}>
	Choice?: ComponentType<{
		children: ReactNode
		label: string
		isSelected: boolean
		isDisabled: boolean
		onSelect: () => void
	}>
}
export type PersonalSourcesImportDialogProps = { topicId: string; onClose: () => void; onImported: () => Promise<void> }

/**
 * Shares import guidance, local preview selection, paging, and confirmation across platforms.
 */
export function PersonalSourcesImportDialog({
	onClose,
	onImported,
	elements,
	importer,
	renderFilePicker,
}: PersonalSourcesImportDialogProps & {
	elements: PersonalSourcesImportDialogElements
	importer?: PersonalSourcesImportController
	renderFilePicker?: () => ReactNode
}) {
	// unmounting releases local pasted text and selection, including on Topic or account changes
	const [title, setTitle] = useState("")
	const [text, setText] = useState("")
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [page, setPage] = useState(0)
	const { Dialog, Group, Text, Button, Field, Choice, Status } = elements
	const preview = importer?.state.status === "preview" ? importer.state.preview : null
	// reset local selection and text before closing or choosing another export
	const handleReset = (): void => {
		// release the parser preview and its selection together
		importer?.reset()
		setSelectedIds(new Set())
		setPage(0)
		setText("")
	}
	const handleClose = (): void => {
		if (!importer?.isImporting) {
			// clear private preview data before the dialog unmounts
			handleReset()
			onClose()
		}
	}
	const handleImport = async (): Promise<void> => {
		// keep the preview available when the import fails
		if (!(await importer?.importSelected(selectedIds))) {
			return
		}
		// clear imported text and refresh the Topic before closing
		setText("")
		setSelectedIds(new Set())
		await onImported()
		onClose()
	}
	return (
		<Dialog
			title="Import selected conversations"
			description={PERSONAL_SOURCES_IMPORT_NOTICE}
			onClose={handleClose}
			isCloseDisabled={importer?.isImporting ?? false}
		>
			<Text className="text-sm">{PERSONAL_SOURCES_PRIVACY_NOTICE}</Text>
			{/* mobile explains the browser-only file APIs without offering an export picker */}
			{!importer && (
				<Text className="text-sm">
					Import conversations on the web. Open this Topic on carlnotes.com to select a ChatGPT or Claude export or
					paste text. Imported Personal sources items are readable here.
				</Text>
			)}
			{/* files and pasted text remain local until the selected preview is confirmed */}
			{importer?.state.status === "idle" && Field && (
				<Group className="space-y-3 gap-3">
					{renderFilePicker?.()}
					<Field label="Pasted conversation title" value={title} onChange={setTitle} maxLength={200} />
					<Field
						label="Pasted conversation text"
						value={text}
						onChange={setText}
						isMultiline
						placeholder="Or paste only the conversation text you want Carl to read…"
					/>
					<Button
						label="Preview pasted text"
						isDisabled={!title.trim() || !text.trim()}
						onPress={() => {
							// hand text to the local parser and release the editor copy
							importer.parseText({ title, text })
							setText("")
						}}
					/>
				</Group>
			)}
			{importer?.state.status === "parsing" && <Status>Reading this export on your device…</Status>}
			{preview && importer && Choice && (
				<Group className="space-y-3 gap-3">
					<Text className="text-sm">{`${preview.conversations.length} conversations found. ${selectedIds.size} selected. Nothing is uploaded until you confirm.`}</Text>
					{preview.conversations.slice(page * 20, (page + 1) * 20).map((conversation) => (
						<Choice
							key={conversation.conversationId}
							label={conversation.title}
							isSelected={selectedIds.has(conversation.conversationId)}
							isDisabled={importer.isImporting}
							onSelect={() =>
								setSelectedIds((current) => {
									// copy the selection so toggling one preview preserves the others
									const selected = new Set(current)
									if (selected.has(conversation.conversationId)) {
										selected.delete(conversation.conversationId)
									} else {
										selected.add(conversation.conversationId)
									}
									return selected
								})
							}
						>
							<Text className="min-w-0 break-words font-semibold">{conversation.title}</Text>
							<Text className="mt-1 text-xs text-muted-foreground">
								{conversation.createdAt?.slice(0, 10) ?? "Pasted text"}
							</Text>
							<Text className="mt-2 whitespace-pre-wrap break-words text-sm">
								{conversation.text.slice(0, 500)}
								{conversation.text.length > 500 ? "…" : ""}
							</Text>
						</Choice>
					))}
					<Group className="flex flex-row flex-wrap gap-2">
						{page > 0 && <Button label="Previous conversations" onPress={() => setPage(page - 1)} />}
						{(page + 1) * 20 < preview.conversations.length && (
							<Button label="Next conversations" onPress={() => setPage(page + 1)} />
						)}
					</Group>
					<Text className="text-sm text-muted-foreground">
						Imported text stays until you delete it. Carl reads up to 80,000 characters across your personal sources
						when rebuilding context and reports incomplete coverage.
					</Text>
					<Button label="Choose a different export" isDisabled={importer.isImporting} onPress={handleReset} />
				</Group>
			)}
			{importer?.error && <Status isError>{importer.error}</Status>}
			<Group className="flex flex-row flex-wrap justify-end gap-2">
				<Button label="Cancel" variant="ghost" isDisabled={importer?.isImporting} onPress={handleClose} />
				{preview && (
					<Button
						variant="default"
						label={importer?.isImporting ? "Importing…" : `Import ${selectedIds.size} selected conversations`}
						isDisabled={selectedIds.size === 0 || importer?.isImporting}
						onPress={() => {
							void handleImport()
						}}
					/>
				)}
			</Group>
		</Dialog>
	)
}
