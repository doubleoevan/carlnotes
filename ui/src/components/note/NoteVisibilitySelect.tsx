// the note visibility pieces: the icon the table shows, and the picker the dialog and create flow share.
// every visibility has its own tooltip
import type { noteVisibilities } from "@shared/enums"
import { Globe, Lock, Users } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

type NoteVisibility = (typeof noteVisibilities)[number]

// the visibilities mapped to their labels, tooltips, and icons
const VISIBILITY_LABELS: Record<NoteVisibility, string> = {
	private: "Private",
	team: "Team",
	public: "Public",
}
export const VISIBILITY_TOOLTIPS: Record<NoteVisibility, string> = {
	private: "Only you can see this note.",
	team: "Only your team can see this note.",
	public: "Everyone can see this note.",
}
const VISIBILITY_ICONS: Record<NoteVisibility, typeof Lock> = {
	private: Lock,
	team: Users,
	public: Globe,
}

/**
 * The visibility icon a note row shows, named by its tooltip.
 */
export function NoteVisibilityIcon({ visibility }: { visibility: NoteVisibility }) {
	const Icon = VISIBILITY_ICONS[visibility]
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="text-muted-foreground inline-flex items-center gap-1.5">
					<Icon className="size-4" />
					{VISIBILITY_LABELS[visibility]}
				</span>
			</TooltipTrigger>
			<TooltipContent>{VISIBILITY_TOOLTIPS[visibility]}</TooltipContent>
		</Tooltip>
	)
}

/**
 * The visibility picker, showing only the visibilities the user may use.
 */
export function NoteVisibilitySelect({
	visibilities,
	visibility,
	onNoteVisibilityChange,
}: {
	visibilities: NoteVisibility[]
	visibility: NoteVisibility
	onNoteVisibilityChange: (visibility: NoteVisibility) => void
}) {
	return (
		<Select value={visibility} onValueChange={(value) => onNoteVisibilityChange(value as NoteVisibility)}>
			<SelectTrigger size="sm" aria-label="Note visibility">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{visibilities.map((visibilityOption) => {
					const Icon = VISIBILITY_ICONS[visibilityOption]
					return (
						<Tooltip key={visibilityOption}>
							<TooltipTrigger asChild>
								<SelectItem value={visibilityOption}>
									<Icon className="size-4" />
									{VISIBILITY_LABELS[visibilityOption]}
								</SelectItem>
							</TooltipTrigger>
							<TooltipContent side="right">{VISIBILITY_TOOLTIPS[visibilityOption]}</TooltipContent>
						</Tooltip>
					)
				})}
			</SelectContent>
		</Select>
	)
}
