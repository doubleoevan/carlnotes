// an svg colored by its className, as the web's svg reads currentColor from its text color
import Svg from "react-native-svg"
import { withUniwind } from "uniwind"

/**
 * An svg whose currentColor stroke and fill read the text color its className gives.
 */
export const ClassNameSvg = withUniwind(Svg, { color: { fromClassName: "className", styleProperty: "color" } })
