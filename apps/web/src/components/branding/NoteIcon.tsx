import { cn } from "@carlnotes/nightshift/classNames"
import { type LucideIcon, NotebookText } from "lucide-react"

/**
 * The written-notebook tile that everything labeled "a note from Carl" shows. A Topic Post's row draws the notebook
 * and pen in the same tile.
 */
export function NoteIcon({ className, icon: Icon = NotebookText }: { className?: string; icon?: LucideIcon }) {
	return (
		<span className={cn("bg-card shadow-raised grid size-6 place-items-center rounded-md", className)}>
			<Icon className="text-primary size-3.75" strokeWidth={2.5} />
		</span>
	)
}
