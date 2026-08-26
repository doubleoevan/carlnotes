import { NotebookPen } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The pen-on-a-notebook tile that everything labeled "a note from Carl" shows.
 */
export function NoteIcon({ className }: { className?: string }) {
	return (
		<span className={cn("bg-card shadow-lift grid size-6 place-items-center rounded-md", className)}>
			<NotebookPen className="text-primary size-3.75" strokeWidth={2.5} />
		</span>
	)
}
