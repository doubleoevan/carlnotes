// the pending attachment chips both chat composers show above their message box
import type { ChatAttachment } from "@shared/contracts"
import { FileText, Film, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// the number of characters in a large copy-paste text block that is turned into an attachment
function toCharacterCountLabel(text: string): string {
	return `${text.length.toLocaleString()} chars`
}

/**
 * The attachments waiting on the next message, as removable chips. An image gets a thumbnail and
 * everything else gets a named chip, so what is about to be sent is visible before it goes.
 */
export function ChatAttachmentChips({
	attachments,
	onRemove,
}: {
	attachments: ChatAttachment[]
	onRemove: (index: number) => void
}) {
	if (attachments.length === 0) {
		return null
	}
	return (
		<div className="mb-2 flex flex-wrap gap-1.5">
			{attachments.map((attachment, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: two pastes share a name, and chips are stateless rows a shift repaints identically
					key={`${attachment.name}-${index}`}
					className="bg-muted flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-xs"
				>
					{attachment.kind === "image" ? (
						<img src={attachment.dataUrl} alt={attachment.name} className="size-6 rounded object-cover" />
					) : attachment.kind === "video" ? (
						<Film className="text-muted-foreground size-3.5 shrink-0" />
					) : (
						<FileText className="text-muted-foreground size-3.5 shrink-0" />
					)}
					<span className="max-w-32 truncate">{attachment.name}</span>
					{attachment.kind === "text" && (
						<span className="text-muted-foreground shrink-0">{toCharacterCountLabel(attachment.text)}</span>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Delete ${attachment.name}`}
								onClick={() => onRemove(index)}
								className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center sm:size-4"
							>
								<X className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent>
							Delete <span className="font-semibold">{attachment.name}</span>
						</TooltipContent>
					</Tooltip>
				</div>
			))}
		</div>
	)
}
