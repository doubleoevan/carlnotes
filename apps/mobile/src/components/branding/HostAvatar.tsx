import { Image } from "expo-image"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

/**
 * Shows Carl or Vienna using the portraits shared with web.
 */
export function HostAvatar({ speaker, size = 24 }: { speaker: "host" | "cohost"; size?: number }) {
	const scaledSize = useFontScaledSize(size)
	return (
		<Image
			source={
				speaker === "host"
					? require("@carlnotes/nightshift/assets/carl-avatar.png")
					: require("@carlnotes/nightshift/assets/vienna-avatar.png")
			}
			style={{ width: scaledSize, height: scaledSize, borderRadius: scaledSize / 2 }}
			accessible={false}
		/>
	)
}
