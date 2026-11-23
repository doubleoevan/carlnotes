// a role change from the admin console, with a toast for its result

import { sendUserRole } from "@carlnotes/client/billingClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { toast } from "sonner"

/**
 * Sets a user's role on the server, then shows a toast naming the new role, or an error toast if the change failed.
 */
export async function changeUserRole({
	userId,
	username,
	role,
}: {
	userId: string
	username: string
	role: "admin" | "user"
}): Promise<void> {
	if (!(await sendUserRole(userId, role))) {
		toast.error("That role change failed.")
		return
	}
	toast(isAdminRole(role) ? `${username} is now an admin.` : `${username} is no longer an admin.`)
}
