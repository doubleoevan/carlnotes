import { Camera } from "lucide-react"
import { useState } from "react"
import { AVATAR_REJECTIONS, AvatarDropOverlay, toDroppedImage } from "@/components/avatar/AvatarUpload"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { FileDropZone } from "@/components/common/FileDropZone"
import { useAvatar } from "@/hooks/useAvatar"
import { cn } from "@/lib/utils"

/**
 * The signed-in user's own avatar with a camera overlay on hover. A click anywhere on the image opens
 * the file chooser, a drag and dropped image skips the chooser, and either uploads at once.
 */
export function UserAvatarPicker({
	userId,
	username,
	className,
}: {
	userId: string
	username: string
	className?: string
}) {
	const [isUploading, setUploading] = useState(false)
	const [updateRejection, setUpdateRejection] = useState<string | null>(null)
	// the source comes from the session, so a finished upload re-renders every picker at once
	const { avatarSource, uploadAvatarFile } = useAvatar()

	// upload the avatar photo. the hook refreshes the session on success, which updates every avatar on the page
	async function handleUploadAvatarFile(avatarFile: File): Promise<void> {
		setUploading(true)
		setUpdateRejection(null)
		try {
			const avatarRejection = await uploadAvatarFile(avatarFile)
			if (avatarRejection) {
				setUpdateRejection(AVATAR_REJECTIONS[avatarRejection] ?? "That didn't reach Carl. Try again.")
			}
		} catch (error) {
			console.error("avatar upload failed", error)
			setUpdateRejection("That didn't reach Carl. Try again.")
		} finally {
			setUploading(false)
		}
	}

	// the chooser's select. clearing the input lets the same file be selected again after a rejection
	function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
		const avatarFile = event.target.files?.[0]
		event.target.value = ""
		if (avatarFile) {
			void handleUploadAvatarFile(avatarFile)
		}
	}

	// a drop skips the chooser, so its accept filter re-runs here
	function handleDropFiles(files: File[]): void {
		const droppedImage = toDroppedImage(files)
		if (!droppedImage) {
			setUpdateRejection(AVATAR_REJECTIONS["unsupported-type"] ?? null)
			return
		}
		void handleUploadAvatarFile(droppedImage)
	}

	return (
		<div>
			<FileDropZone onDropFiles={handleDropFiles} overlay={<AvatarDropOverlay />} className="w-fit">
				<label className={cn("group relative block size-14 cursor-pointer", className)} aria-label="Change your avatar">
					<UserAvatar userId={userId} username={username} avatarSource={avatarSource} className="size-full" />
					{/* the camera overlay appears on hover or keyboard focus */}
					<span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
						<Camera className="size-5 text-white" />
					</span>
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						onChange={handleFileChange}
						disabled={isUploading}
						className="sr-only"
					/>
				</label>
			</FileDropZone>
			{updateRejection && (
				<p role="alert" className="text-destructive mt-1 text-xs">
					{updateRejection}
				</p>
			)}
		</div>
	)
}
