import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The "All" "Unread" toggle. Unread hides topic findings the user has already consumed
 */
export function UnreadToggle({ showAll, onChange }: { showAll: boolean; onChange: (all: boolean) => void }) {
	return (
		<div className="bg-secondary inline-flex rounded-lg p-0.5">
			<ToggleButton isActive={showAll} onClick={() => onChange(true)}>
				All
			</ToggleButton>
			{/* unread filter */}
			<ToggleButton isActive={!showAll} onClick={() => onChange(false)}>
				Unread
			</ToggleButton>
		</div>
	)
}

// one toggle button. the active side takes the primary fill
function ToggleButton({
	isActive,
	onClick,
	children,
}: {
	isActive: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isActive}
			className={cn(
				"min-h-11 min-w-14 rounded-md px-3 text-sm sm:min-h-9",
				isActive ? "bg-primary text-primary-foreground" : "text-secondary-foreground",
			)}
		>
			{children}
		</button>
	)
}
