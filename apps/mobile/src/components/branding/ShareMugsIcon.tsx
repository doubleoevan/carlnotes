import { Coffee } from "lucide-react-native"
import { View } from "react-native"
import { Icon } from "@/components/primitives/icon"

/**
 * Lucide's mug twice, facing each other, for a comment that Carl and Vienna talked about.
 */
export function ShareMugsIcon() {
	return (
		<View className="flex-row">
			<View style={{ transform: [{ scaleX: -1 }] }}>
				<Icon as={Coffee} className="text-primary" />
			</View>
			<Icon as={Coffee} className="text-primary" />
		</View>
	)
}
