import type { McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import { toPersonalSourcesSendText } from "@carlnotes/contracts/personalSourcesSendText"
import { DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import { ExternalLink, Plus } from "lucide-react"
import { useState } from "react"
import { TopicDraftCard } from "@/components/chat/TopicDraftCard"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { callMcpViewTool, useMcpViewData } from "./mcpViewHost"
import { TopicDraftEditor } from "./TopicDraftEditor"
import { createEditedTopicDraft } from "./topicDraftCreation"

/**
 * Shows saved personal sources receipts or the shared Topic Draft preview and confirmation.
 */
export function TopicMcpView({
	mcpViewTopicResult,
	editTopicArguments,
	onCreated,
	shouldFillHeight = false,
}: {
	mcpViewTopicResult: McpViewTopicResult
	// the edit the tool was called with, which Save sends again
	editTopicArguments: Record<string, unknown> | null
	onCreated?: (topic: { id: string; name: string }) => Promise<void>
	shouldFillHeight?: boolean
}) {
	return "afterTopicDraft" in mcpViewTopicResult ? (
		<TopicEditMcpView
			mcpViewTopicResult={mcpViewTopicResult}
			editTopicArguments={editTopicArguments}
			onCreated={onCreated}
			shouldFillHeight={shouldFillHeight}
		/>
	) : (
		<PersonalSourcesSendReceipt result={mcpViewTopicResult} />
	)
}

// retained edit state is separate from send outcomes, which never perform a write from the MCP view
function TopicEditMcpView({
	mcpViewTopicResult,
	editTopicArguments,
	onCreated,
	shouldFillHeight = false,
}: {
	mcpViewTopicResult: Extract<McpViewTopicResult, { afterTopicDraft: unknown }>
	editTopicArguments: Record<string, unknown> | null
	onCreated?: (topic: { id: string; name: string }) => Promise<void>
	shouldFillHeight?: boolean
}) {
	// the result the MCP view shows, which a save replaces, and the save's own rejection
	const [shownTopicMcpViewResult, setShownTopicMcpViewResult] = useState(mcpViewTopicResult)
	const [isSaving, setIsSaving] = useState(false)
	const [editedDraft, setEditedDraft] = useState(() => {
		const draft = mcpViewTopicResult.afterTopicDraft
		return draft
			? {
					...draft,
					sources: draft.sources.filter(
						(source) => !DEFAULT_SOURCES.some((option) => option.key === source.sourceOption),
					),
				}
			: null
	})
	const [saveRejection, setSaveRejection] = useState<string | null>(null)

	// apply a confirmed creation or retain the edited preview and its rejection
	const handleCreate = async (
		preview: Extract<McpViewTopicResult, { status: "createConfirmRequired" }>,
	): Promise<void> => {
		const creation = await createEditedTopicDraft({ preview, draft: editedDraft })
		if (creation.status === "failed") {
			setSaveRejection(creation.rejection)
			return
		}
		if (creation.status === "preview") {
			setShownTopicMcpViewResult(creation.preview)
			setEditedDraft(creation.preview.afterTopicDraft)
			setSaveRejection(creation.rejection)
			return
		}
		setShownTopicMcpViewResult(creation.topic)
		await onCreated?.({ id: creation.topic.topicId, name: creation.name })
		return
	}

	// save the previewed edit with its confirmation, and show the saved topic or what stopped the save
	const handleSave = async (): Promise<void> => {
		if (
			shownTopicMcpViewResult.status !== "confirmRequired" &&
			shownTopicMcpViewResult.status !== "createConfirmRequired"
		) {
			return
		}
		setIsSaving(true)
		setSaveRejection(null)
		try {
			if (shownTopicMcpViewResult.status === "createConfirmRequired") {
				await handleCreate(shownTopicMcpViewResult)
				return
			}
			const editTopicResult = await callMcpViewTool("edit_topic", {
				...editTopicArguments,
				confirmation: shownTopicMcpViewResult.confirmation,
			})
			const savedTopicMcpViewResult = editTopicResult.structuredContent as
				| Extract<McpViewTopicResult, { afterTopicDraft: unknown }>
				| undefined
			if (editTopicResult.isError || !savedTopicMcpViewResult) {
				setSaveRejection(toToolResultText(editTopicResult.content))
				return
			}
			setShownTopicMcpViewResult(savedTopicMcpViewResult)
		} catch {
			setSaveRejection("The request could not complete. Check the Topic before trying again.")
		} finally {
			setIsSaving(false)
		}
	}
	if (!shownTopicMcpViewResult.afterTopicDraft) {
		return null
	}
	return (
		<div
			className={`${shownTopicMcpViewResult.status === "createConfirmRequired" ? "flex min-h-0 flex-col gap-3" : "bg-card rounded-lg border"} ${shouldFillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}
		>
			{shownTopicMcpViewResult.status === "createConfirmRequired" && editedDraft ? (
				<TopicDraftEditor
					topicDraft={editedDraft}
					isDisabled={isSaving}
					onChange={setEditedDraft}
					isPrivateSendDestination={Boolean(onCreated)}
					shouldFillHeight={shouldFillHeight}
				/>
			) : (
				<TopicDraftCard
					topicDraft={shownTopicMcpViewResult.afterTopicDraft}
					topicId={shownTopicMcpViewResult.topicId}
					isTopicEditProposed={shownTopicMcpViewResult.status === "confirmRequired"}
				/>
			)}
			{/* creation confirms the edited fields with one standard action */}
			{shownTopicMcpViewResult.status === "createConfirmRequired" && (
				<div className="flex shrink-0 flex-col items-end gap-2">
					{saveRejection && (
						<p role="alert" className="text-destructive text-sm">
							{saveRejection}
						</p>
					)}
					<Button className="w-full sm:w-auto" disabled={isSaving} onClick={() => void handleSave()}>
						<Plus aria-hidden className="size-4" />
						Create this Topic
					</Button>
				</div>
			)}
			{/* existing Topic edits retain their description and confirmation */}
			{shownTopicMcpViewResult.status === "confirmRequired" && (
				<div className="flex shrink-0 items-center justify-end gap-3 border-t px-3 py-2">
					{saveRejection ? (
						<p role="alert" className="text-destructive flex-1 text-sm">
							{saveRejection}
						</p>
					) : (
						<p className="flex-1 text-sm">{`Save ${shownTopicMcpViewResult.topicEditChanges.join(" and ")}.`}</p>
					)}
					<Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
						Save
					</Button>
				</div>
			)}
		</div>
	)
}

// results are display-only. receipt links describe this send's current waiting work
function PersonalSourcesSendReceipt({ result }: { result: PersonalSourcesSendResult }) {
	const { sendReceiptLinks } = useMcpViewData()
	if (result.status !== "accepted") {
		return (
			<p role="status" className="bg-card break-words rounded-lg border p-3 text-sm">
				{toPersonalSourcesSendText(result)}
			</p>
		)
	}

	// keep the saved title and each destination separate from its numbered links
	const receipts = result.receipts ?? [result]
	return (
		<section className="bg-card min-w-0 break-words space-y-4 rounded-lg border p-3 text-sm" aria-label="Saved chat">
			<p role="status">
				Saved “<strong>{result.title}</strong>” to {receipts.length} {receipts.length === 1 ? "topic" : "topics"}.
			</p>
			{receipts.map((receipt) => {
				const links = sendReceiptLinks?.find((entry) => entry.entryId === receipt.entryId)?.links
				return (
					<section key={receipt.entryId} className="min-w-0 space-y-2" aria-label={receipt.topic.name}>
						<AnchorLink
							href={receipt.topic.url}
							isNewTab
							className={`${STANDALONE_LINK_CLASS} inline-flex min-w-0 max-w-full items-center gap-1`}
						>
							<span className="truncate">{receipt.topic.name}</span>
							<ExternalLink aria-hidden className="size-3 shrink-0" />
						</AnchorLink>
						<p className="text-muted-foreground">Links for next brew</p>
						{links?.length ? (
							<ol className="space-y-1" aria-label={`Links for ${receipt.topic.name}`}>
								{links.map((link, index) => (
									<li key={link.url} className="flex min-w-0 items-baseline gap-2">
										<span aria-hidden className="text-muted-foreground shrink-0">
											{index + 1}.
										</span>
										<AnchorLink
											href={link.url}
											isUserContent
											className={`${STANDALONE_LINK_CLASS} inline-flex min-w-0 items-center gap-1`}
											title={link.title ?? link.url}
										>
											<span className="truncate">{link.title?.trim() || link.url}</span>
											<ExternalLink aria-hidden className="size-3 shrink-0" />
										</AnchorLink>
									</li>
								))}
							</ol>
						) : (
							<p className="text-muted-foreground">
								{links
									? "No links from this chat are waiting."
									: "Check this Topic’s Personal sources for its waiting links."}
							</p>
						)}
					</section>
				)
			})}
		</section>
	)
}

// a tool result's text, joined
function toToolResultText(content: unknown): string {
	if (!Array.isArray(content)) {
		return ""
	}
	return content.map((contentBlock) => (contentBlock as { text?: string }).text ?? "").join(" ")
}
