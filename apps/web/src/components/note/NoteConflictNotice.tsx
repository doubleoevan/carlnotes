// the notice a lost save shows: who saved first, and the reload that takes their version
import { Button } from "@/components/primitives/button"

/**
 * The notice above a note whose save lost to a newer version. The words stay in the editor until the reload.
 */
export function NoteConflictNotice({
	lastEditorUsername,
	isReloading,
	onReload,
}: {
	// who saved last, null for a closed account
	lastEditorUsername: string | null
	isReloading: boolean
	onReload: () => void
}) {
	// who saved last, by name, or someone else for a closed account
	const lastEditorLabel = lastEditorUsername ? `@${lastEditorUsername}` : "someone else"
	return (
		<div role="alert" className="bg-muted mb-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
			<p className="min-w-0 flex-1">
				{`Saved by ${lastEditorLabel} since you opened it. Copy anything you want to keep, then reload.`}
			</p>
			<Button size="sm" onClick={onReload} disabled={isReloading}>
				{isReloading ? "Reloading…" : "Reload"}
			</Button>
		</div>
	)
}
