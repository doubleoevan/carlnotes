// the radio group shows every choice with the chosen one on, and choosing it again changes nothing
import { expect, test } from "bun:test"
import { isValidElement, type ReactElement, type ReactNode } from "react"
import { RadioGroup, type RadioGroupElements } from "./RadioGroup"

// elements that render nothing, so the test reads the tree the group returns
const ELEMENTS: RadioGroupElements = { Group: () => null, Option: () => null }

// the option elements of the group's tree
function toOptions(node: ReactNode): ReactElement<{ label: string; isSelected: boolean; onSelect: () => void }>[] {
	if (!isValidElement<{ children?: ReactNode }>(node)) {
		return []
	}
	const children = [node.props.children].flat() as ReactNode[]
	return children.filter(isValidElement) as ReactElement<{ label: string; isSelected: boolean; onSelect: () => void }>[]
}

test("the chosen format is on, another option changes it, and the chosen one changes nothing", () => {
	const changes: string[] = []
	const tree = RadioGroup({
		label: "Format",
		value: "both",
		choices: [
			{ value: "audio", label: "Podcasts" },
			{ value: "video", label: "Films" },
			{ value: "both", label: "Both" },
		],
		onChange: (value) => changes.push(value),
		elements: ELEMENTS,
	})
	const options = toOptions(tree)
	expect(options.map(({ props }) => [props.label, props.isSelected])).toEqual([
		["Podcasts", false],
		["Films", false],
		["Both", true],
	])

	// choosing Films changes it, and choosing Both again does nothing
	options[1]?.props.onSelect()
	options[2]?.props.onSelect()
	expect(changes).toEqual(["video"])
})
