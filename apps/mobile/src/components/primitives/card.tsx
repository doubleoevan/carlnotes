// the mobile implementation of the Nightshift Card: the contract's raised surface as a View
import { cn } from "@carlnotes/nightshift/classNames"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import { View, type ViewProps } from "react-native"

/**
 * A raised card surface. Its body is the padded column inside it.
 */
export function Card({ className, ...props }: ViewProps) {
	return <View className={cn(cardClasses.root, className)} {...props} />
}

/**
 * The padded column inside a Card.
 */
export function CardBody({ className, ...props }: ViewProps) {
	return <View className={cn(cardClasses.body, className)} {...props} />
}
