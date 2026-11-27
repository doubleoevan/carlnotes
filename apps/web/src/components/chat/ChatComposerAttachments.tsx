import type { KeptChatAttachment } from "@carlnotes/contracts/chat"
import { toDeleteFileConfirmation } from "@carlnotes/core/lib/confirmationCopy"
import { toAgeLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { FileText, FileX2, Film, Image, Minus, Paperclip, X } from "lucide-react"
import { useRef } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { ICON_BUTTON_CLASS, SECTION_LABEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { CHAT_FILE_PICKER_ACCEPT } from "@/lib/utils"

/**
 * The kept files button: a file-x opening the downloadable attachments for this topic chat. Deleting an attachment
 * frees a slot under the limit.
 */
export function KeptAttachmentsButton({
	keptAttachments,
	onRemoveKeptAttachment,
}: {
	keptAttachments: KeptChatAttachment[]
	onRemoveKeptAttachment: (keptAttachmentId: string) => Promise<void>
}) {
	const { confirm, confirmDialog } = useConfirmDialog()
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger aria-label="Clear files or photos" className={ICON_BUTTON_CLASS}>
						<FileX2 className="size-4" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Clear files or photos</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-64 text-sm" bodyClassName="p-2">
				{/* the minimize button in the corner of the panel closes the attachments menu */}
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverClose
							aria-label="Minimize"
							className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-md sm:size-6"
						>
							<Minus className="size-4" />
						</PopoverClose>
					</TooltipTrigger>
					<TooltipContent>Minimize</TooltipContent>
				</Tooltip>
				{/* the centered label names the attachments menu */}
				<div className={cn(SECTION_LABEL_CLASS, "mb-1 text-center")}>Chat files</div>
				{keptAttachments.map((keptAttachment) => (
					<div key={keptAttachment.id} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
						{keptAttachment.kind === "image" ? (
							<Image aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						) : keptAttachment.kind === "video" ? (
							<Film aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						) : (
							<FileText aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								{/* the file download */}
								<AnchorLink
									href={`/api/chat-attachments/${keptAttachment.id}/download`}
									download={keptAttachment.name}
									className={cn(STANDALONE_LINK_CLASS, "min-w-0 flex-1 truncate")}
								>
									{keptAttachment.name}
								</AnchorLink>
							</TooltipTrigger>
							<TooltipContent>Click to download</TooltipContent>
						</Tooltip>
						{/* the name truncates before its age does */}
						<span className="text-muted-foreground shrink-0 text-xs">{toAgeLabel(keptAttachment.at)}</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`Delete ${keptAttachment.name}`}
									onClick={() =>
										confirm(toDeleteFileConfirmation(keptAttachment.name), () =>
											onRemoveKeptAttachment(keptAttachment.id),
										)
									}
									className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center sm:size-5"
								>
									<X className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Delete <span className="font-semibold">{keptAttachment.name}</span>
							</TooltipContent>
						</Tooltip>
					</div>
				))}
				{confirmDialog}
			</PopoverContent>
		</Popover>
	)
}

/**
 * The paperclip and its hidden file picker. A visitor's click routes to the signup page.
 */
export function ChatAttachButton({
	isSignupRequired,
	onSelect,
	onSignup,
}: {
	isSignupRequired: boolean
	onSelect: (files: File[]) => Promise<unknown>
	onSignup: () => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	return (
		<>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={CHAT_FILE_PICKER_ACCEPT}
				className="hidden"
				onChange={(event) => {
					void onSelect(Array.from(event.target.files ?? []))
					event.target.value = ""
				}}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={isSignupRequired ? "Sign up to add files" : "Add files or photos"}
						onClick={() => (isSignupRequired ? onSignup() : inputRef.current?.click())}
						className={ICON_BUTTON_CLASS}
					>
						<Paperclip className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>{isSignupRequired ? "Sign up to add files" : "Add files or photos"}</TooltipContent>
			</Tooltip>
		</>
	)
}
