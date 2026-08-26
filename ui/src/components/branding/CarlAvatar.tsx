import { cn } from "@/lib/utils"
import carlAvatar from "../../assets/carl-avatar.png"

/**
 * Carl's own avatar, the raccoon. He has no account,
 * so it is an image instead of the initials-and-tint treatment a user or a team gets.
 */
export function CarlAvatar({ className }: { className?: string }) {
	return <img src={carlAvatar} alt="Carl" className={cn("size-6 shrink-0 rounded-full", className)} />
}
