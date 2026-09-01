import { User } from "lucide-react"
import { ProfileFields } from "@/components/account/AccountSettings"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { useUsernameChange } from "@/hooks/useUsernameChange"

/**
 * The modal for editing the signed-in user's own profile, which the same fields the account page shows.
 * The avatar saves itself, and Save sends whatever username is typed before closing.
 */
export function EditProfileModal({
	userId,
	username,
	onClose,
	onUsernameChanged,
}: {
	userId: string
	username: string
	onClose: () => void
	// the profile page's own copy of the username, refreshed once a change lands
	onUsernameChanged?: () => void
}) {
	// the modal owns the username change, so the shared form hides its own submit button
	const usernameChange = useUsernameChange(onUsernameChanged)

	// save a typed username first. a rejection keeps the modal open so its message shows
	const handleSaveProfile = async (): Promise<void> => {
		if (usernameChange.username.trim() !== "" && !(await usernameChange.saveUsername())) {
			return
		}
		onClose()
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle className="flex items-center gap-2">
					<User className="size-5" />
					Edit profile
				</DialogTitle>
				<ProfileFields userId={userId} username={username} usernameChange={usernameChange} />
				<DialogFooter>
					<Button onClick={() => void handleSaveProfile()} disabled={usernameChange.isSaving}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
