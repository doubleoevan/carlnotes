// the team avatar with the camera overlay
import type { TeamIdentity } from "@shared/contracts"
import { Camera } from "lucide-react"
import { toast } from "sonner"
import { AVATAR_REJECTIONS, AvatarDropOverlay, toDroppedImage } from "@/components/avatar/AvatarUpload"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { FileDropZone } from "@/components/common/FileDropZone"
import { cn } from "@/lib/utils"

/**
 * Choose a team's image, by the file chooser or by dropping one on it. What happens to the chosen file
 * is the caller's: the team page uploads it at once, and the edit modal holds it until Save.
 */
export function TeamAvatarPicker({
	team,
	previewUrl,
	onAvatarChange,
	isDisabled,
	className,
}: {
	team: Pick<TeamIdentity, "teamId" | "name" | "hasAvatar">
	// a chosen image not yet uploaded, shown in place of whatever the team has today
	previewUrl?: string | null
	onAvatarChange: (avatarFile: File) => void
	// set while an upload is in flight, so a second file cannot be chosen over it
	isDisabled?: boolean
	// the size, which differs between the team page and the modal
	className?: string
}) {
	// a drop skips the chooser, so its accept filter re-runs here
	const handleDropFiles = (files: File[]): void => {
		const droppedImage = toDroppedImage(files)
		if (!droppedImage) {
			toast.error(AVATAR_REJECTIONS["unsupported-type"] ?? "PNG, JPEG, WebP or GIF only.")
			return
		}
		onAvatarChange(droppedImage)
	}

	return (
		<FileDropZone onDropFiles={handleDropFiles} overlay={<AvatarDropOverlay />} className="w-fit">
			<label className={cn("group relative block cursor-pointer", className)} aria-label="Change the team avatar">
				{previewUrl ? (
					<img src={previewUrl} alt="" className="size-full rounded-full border object-cover shadow-lift" />
				) : (
					<TeamAvatar team={team} className="size-full" />
				)}
				{/* the camera overlay appears on hover or keyboard focus only */}
				<span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
					<Camera className="size-5 text-white" />
				</span>
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					onChange={(event) => {
						const chosen = event.target.files?.[0]
						if (chosen) {
							onAvatarChange(chosen)
						}
					}}
					disabled={isDisabled}
					className="sr-only"
				/>
			</label>
		</FileDropZone>
	)
}
