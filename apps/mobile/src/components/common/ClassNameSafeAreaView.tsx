// the safe area view styled by its className. Uniwind styles only the components it wraps
import { SafeAreaView } from "react-native-safe-area-context"
import { withUniwind } from "uniwind"

/**
 * A safe area view whose className sets its style, as a React Native View's does.
 */
export const ClassNameSafeAreaView = withUniwind(SafeAreaView)
