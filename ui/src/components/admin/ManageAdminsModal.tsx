import type { AdminUserRow } from "@shared/contracts"
import { ChevronsUpDown, ShieldUser, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendUserRole } from "@/clients/billingClient"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { IconButton } from "@/components/common/IconButton"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"

/**
 * The modal for an admin to add and remove other admins.
 */
export function ManageAdminsModal({
	users,
	signedInUserId,
	onClose,
	onChanged,
}: {
	users: AdminUserRow[]
	signedInUserId: string
	onClose: () => void
	onChanged: () => void
}) {
	// yourself first, then the rest of the users in the payload's order
	const admins = users
		.filter((user) => user.role === "admin")
		.sort((firstUser, secondUser) => Number(secondUser.id === signedInUserId) - Number(firstUser.id === signedInUserId))

	// promote a user to an admin and show a toast
	const handleAddAdmin = async (account: AdminUserRow): Promise<void> => {
		if (await sendUserRole(account.id, "admin")) {
			toast(`${account.username} is now an admin.`)
		} else {
			toast.error("That role change failed.")
		}
		onChanged()
	}

	// demote an admin to a user and show a toast
	const handleRemoveAdmin = async (admin: AdminUserRow): Promise<void> => {
		if (await sendUserRole(admin.id, "user")) {
			toast(`${admin.username} is no longer an admin.`)
		} else {
			toast.error("That role change failed.")
		}
		onChanged()
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle className="flex items-center gap-2">
					<ShieldUser className="size-5" />
					Manage admins
				</DialogTitle>
				<DialogDescription>An admin sees every account, team, and topic, and this console.</DialogDescription>
				{/* the current admins, each removable but yourself */}
				<ul className="space-y-2">
					{admins.map((admin) => (
						<li key={admin.id} className="flex items-center gap-2 text-sm">
							<UserAvatar
								userId={admin.id}
								username={admin.username}
								avatarSource={admin.avatarSource}
								className="size-6"
							/>
							<span className="min-w-0 flex-1 truncate">
								{admin.username}
								<span className="text-muted-foreground">{` · ${admin.email}`}</span>
							</span>
							{admin.id !== signedInUserId && (
								<IconButton
									tooltip={
										<>
											Remove <span className="font-semibold">{admin.username}</span> as admin
										</>
									}
									ariaLabel={`Remove ${admin.username} as admin`}
									onClick={() => void handleRemoveAdmin(admin)}
								>
									<X className="size-4" />
								</IconButton>
							)}
						</li>
					))}
				</ul>
				<AddAdminMenu
					users={users.filter((user) => user.role !== "admin")}
					onAddAdmin={(account) => void handleAddAdmin(account)}
				/>
			</DialogContent>
		</Dialog>
	)
}

// the dropdown menu for adding admins
function AddAdminMenu({ users, onAddAdmin }: { users: AdminUserRow[]; onAddAdmin: (account: AdminUserRow) => void }) {
	const [isOpen, setIsOpen] = useState(false)
	const [userFilter, setUserFilter] = useState("")

	// filter the list by email or username
	const query = userFilter.trim().toLowerCase()
	const filteredUsers = users.filter((account) => `${account.email} ${account.username}`.toLowerCase().includes(query))

	// selecting promotes, closes the list, and clears the filter for the next open
	const handleSelectAdmin = (user: AdminUserRow): void => {
		onAddAdmin(user)
		setIsOpen(false)
		setUserFilter("")
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="border-input bg-background flex min-h-9 w-full items-center justify-between rounded-md border px-3 text-sm"
				>
					<span className="text-muted-foreground">add by email…</span>
					<ChevronsUpDown className="size-4 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-(--radix-popover-trigger-width)" bodyClassName="p-1">
				{/* the search filter, then the filtered users. the popover does not move focus when it opens */}
				<input
					// biome-ignore lint/a11y/noAutofocus: this field is why the panel opens
					autoFocus
					value={userFilter}
					onChange={(event) => setUserFilter(event.target.value)}
					placeholder="Search…"
					aria-label="Filter the accounts"
					className="placeholder:text-muted-foreground mb-1 w-full bg-transparent px-2 py-1.5 text-sm outline-none"
				/>
				<div className="max-h-56 overflow-y-auto">
					{filteredUsers.map((user) => (
						<button key={user.id} type="button" onClick={() => handleSelectAdmin(user)} className={MENU_OPTION_CLASS}>
							<UserAvatar
								userId={user.id}
								username={user.username}
								avatarSource={user.avatarSource}
								className="size-5 shrink-0"
							/>
							<span className="min-w-0 flex-1 truncate">
								{user.username}
								<span className="text-muted-foreground">{` · ${user.email}`}</span>
							</span>
						</button>
					))}
				</div>
				{/* nothing left after filtering */}
				{filteredUsers.length === 0 && <p className="text-muted-foreground px-2 py-2 text-sm">No matching user.</p>}
			</PopoverContent>
		</Popover>
	)
}
