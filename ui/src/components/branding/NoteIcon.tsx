import { SquarePen } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The pen-on-a-card tile every "a note from Carl" control shows.
 */
export function NoteIcon({ className }: { className?: string }) {
	return (
		<span className={cn("bg-card shadow-raise grid size-6 place-items-center rounded-md", className)}>
			<SquarePen className="text-primary size-3.75" strokeWidth={2.5} />
		</span>
	)
}
