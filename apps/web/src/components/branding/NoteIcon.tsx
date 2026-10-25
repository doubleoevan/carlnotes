import { cn } from "@carlnotes/nightshift/classNames"
import { NotebookText } from "lucide-react"

/**
 * The written-notebook tile that everything labeled "a note from Carl" shows.
 */
export function NoteIcon({ className }: { className?: string }) {
	return (
		<span className={cn("bg-card shadow-raised grid size-6 place-items-center rounded-md", className)}>
			<NotebookText className="text-primary size-3.75" strokeWidth={2.5} />
		</span>
	)
}
