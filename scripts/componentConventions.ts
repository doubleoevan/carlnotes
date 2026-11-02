// the structural gaps left by Biome: primary component count, its identity, and locally owned props names
import { posix } from "node:path"
import {
	type ComponentModule,
	child,
	nodes,
	parseComponentModule,
	type SyntaxNode,
	syntaxChildren,
	syntaxName,
	syntaxPosition,
	unwrapSyntax,
} from "./componentSyntax"
import type { SourceFile } from "./workspaces"

/** A convention finding, with a one-based location and a stable rule identifier. */
export type ComponentDiagnostic = { rule: string; line: number; column: number; message: string }

/** A checked module or a module whose exported identity needs review. */
export type ComponentAnalysis = {
	classification: "checked" | "review"
	primaryName?: string
	diagnostics: ComponentDiagnostic[]
}

// a resolved component keeps its implementation and the props annotations from its wrappers
type ComponentResolution =
	| { kind: "component"; node: SyntaxNode; props: SyntaxNode[]; identity: SyntaxNode }
	| { kind: "other" | "review" }

// the function forms whose bodies the checker understands
const FUNCTION_KINDS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])

/**
 * Checks one TSX module without evaluating its exports or resolving a project graph.
 */
export function checkComponentConventions({ filePath, fileText }: SourceFile): ComponentAnalysis {
	// resolve exports and private support through the same local declaration table
	const module = parseComponentModule(fileText)
	const expectedName = posix.basename(filePath, ".tsx")
	const { diagnostics, components, checkedProps } = analyzeExports(module, expectedName)
	// leave unresolved identities for review and count known components
	const isReview = diagnostics.some((diagnostic) => diagnostic.rule === "component/review")
	if (components.size > 1 || (components.size === 0 && !isReview)) {
		const names = [...components.values()].map(({ name }) => name)
		diagnostics.push({
			rule: "component/primary-count",
			line: 1,
			column: 1,
			message: `Expected one primary component, found ${components.size}${names.length ? `: ${names.join(", ")}` : ""}`,
		})
	}
	// check locally owned props on private supporting components
	for (const [name, declaration] of module.declarations) {
		if (!/^[A-Z]/.test(name)) {
			continue
		}
		// check each implementation's props once
		const resolution = resolveComponent({ node: declaration, module })
		if (resolution.kind === "component" && !checkedProps.has(resolution.node)) {
			checkedProps.add(resolution.node)
			diagnostics.push(...propsFindings({ resolution, name, module }))
		}
	}
	return {
		classification: isReview ? "review" : "checked",
		primaryName: components.size === 1 ? [...components.values()][0]?.name : undefined,
		diagnostics,
	}
}

// resolve the public bindings and retain private implementations already checked
function analyzeExports(
	module: ComponentModule,
	expectedName: string,
): {
	diagnostics: ComponentDiagnostic[]
	components: Map<SyntaxNode, { name: string; node: SyntaxNode }>
	checkedProps: Set<SyntaxNode>
} {
	const diagnostics: ComponentDiagnostic[] = []
	const components = new Map<SyntaxNode, { name: string; node: SyntaxNode }>()
	const checkedProps = new Set<SyntaxNode>()
	// resolve component-shaped exports through their local declarations
	for (const exported of module.exports) {
		if (!exported.isExternal && !/^[A-Z]/.test(exported.name) && exported.name !== "default") {
			continue
		}
		// external identities require review
		const declaration = module.declarations.get(exported.localName)
		const resolution = exported.isExternal
			? { kind: "review" as const }
			: resolveComponent({ node: declaration, module })
		if (resolution.kind === "review") {
			diagnostics.push(
				finding({
					node: exported.node,
					rule: "review",
					message: `Resolve the exported identity of ${exported.name || "*"}`,
				}),
			)
			continue
		}
		if (resolution.kind !== "component") {
			continue
		}
		// validate the public name and each implementation's props
		components.set(resolution.identity, { name: exported.name, node: exported.node })
		checkComponentName({ name: exported.name, expectedName, node: exported.node, diagnostics })
		if (!checkedProps.has(resolution.node)) {
			checkedProps.add(resolution.node)
			diagnostics.push(...propsFindings({ resolution, name: exported.name, module }))
		}
	}

	return { diagnostics, components, checkedProps }
}

// compare the public component name with its filename
function checkComponentName({
	name,
	expectedName,
	node,
	diagnostics,
}: {
	name: string
	expectedName: string
	node: SyntaxNode
	diagnostics: ComponentDiagnostic[]
}): void {
	if (name !== expectedName) {
		diagnostics.push(
			finding({ node, rule: "primary-name", message: `Expected component ${expectedName}, found ${name}` }),
		)
	}
}

// follow local aliases with a cycle guard, then classify the value by its syntax
function resolveComponent({
	node,
	module,
	visited = new Set(),
}: {
	node: SyntaxNode | undefined
	module: ComponentModule
	visited?: Set<SyntaxNode>
}): ComponentResolution {
	// stop at missing declarations and alias cycles
	node = unwrapSyntax(node)
	if (!node || visited.has(node)) {
		return { kind: "review" }
	}
	// follow references through the local declaration table
	visited.add(node)
	if (node.type === "Identifier") {
		return resolveComponent({ node: module.declarations.get(syntaxName(node)), module, visited })
	}
	if (node.type === "VariableDeclarator") {
		// retain props declared on a component binding
		const resolution = resolveComponent({ node: child(node, "init"), module, visited })
		if (resolution.kind === "component") {
			const annotation = child(child(node, "id"), "typeAnnotation")
			resolution.props.push(...componentTypeProps(child(annotation, "typeAnnotation")))
		}
		return resolution
	}
	// resolve functions and known React wrappers
	if (FUNCTION_KINDS.has(node.type)) {
		return resolveFunction(node, module)
	}
	if (node.type === "CallExpression") {
		return resolveWrapper({ node, module, visited })
	}
	return { kind: "other" }
}

// recognize the React wrappers by their actual imported names
function resolveWrapper({
	node,
	module,
	visited,
}: {
	node: SyntaxNode
	module: ComponentModule
	visited: Set<SyntaxNode>
}): ComponentResolution {
	// accept the React wrappers with known component semantics
	const wrapperName = reactCallName(child(node, "callee"), module)
	if (wrapperName !== "memo" && wrapperName !== "forwardRef") {
		return { kind: "review" }
	}
	// combine the wrapper's props annotation with its implementation
	const resolution = resolveComponent({ node: nodes(node.arguments)[0], module, visited })
	if (resolution.kind === "component") {
		const typeArguments = child(node, "typeArguments") ?? child(node, "typeParameters")
		const props = nodes(typeArguments?.params)[wrapperName === "forwardRef" ? 1 : 0]
		if (props) {
			resolution.props.push(props)
		}
		// each wrapper call creates a distinct component identity
		resolution.identity = node
	}
	return resolution
}

// classify the function's own return expressions
function resolveFunction(node: SyntaxNode, module: ComponentModule): ComponentResolution {
	const body = child(node, "body")
	const returns = body?.type === "BlockStatement" ? functionReturns(body) : body ? [body] : []
	if (!returns.length) {
		return { kind: "other" }
	}
	// accept renderable or null-returning components and expose opaque returns
	const renderKinds = returns.map((expression) => renderKind(expression, module))
	if (!renderKinds.includes("render") && !renderKinds.every((kind) => kind === "empty")) {
		return { kind: renderKinds.includes("unknown") ? "review" : "other" }
	}
	// read the first parameter's props annotation, including default values
	const parameter = nodes(node.params)[0]
	const propsParameter = parameter?.type === "AssignmentPattern" ? child(parameter, "left") : parameter
	const props = child(child(propsParameter, "typeAnnotation"), "typeAnnotation")
	return { kind: "component", node, identity: node, props: props ? [props] : [] }
}

// retain returns belonging to this function, without entering nested callbacks
function functionReturns(node: SyntaxNode): SyntaxNode[] {
	if (node.type === "ReturnStatement") {
		const expression = child(node, "argument")
		return expression ? [expression] : []
	}
	// nested functions own their return expressions
	if (FUNCTION_KINDS.has(node.type)) {
		return []
	}
	return syntaxChildren(node).flatMap(functionReturns)
}

// recognize render expressions conservatively and expose opaque expressions for review
function renderKind(node: SyntaxNode, module: ComponentModule): "render" | "empty" | "other" | "unknown" {
	node = unwrapSyntax(node) ?? node
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		return "render"
	}
	if (node.type === "NullLiteral") {
		return "empty"
	}
	// recognize element factories and expressions containing rendered children
	if (node.type === "CallExpression" && reactCallName(child(node, "callee"), module) === "createElement") {
		return "render"
	}
	if (["ConditionalExpression", "LogicalExpression", "ArrayExpression"].includes(node.type)) {
		const kinds = syntaxChildren(node).map((expression) => renderKind(expression, module))
		return kinds.includes("render") ? "render" : "unknown"
	}
	// leave indirect expressions for review
	return node.type.endsWith("Literal") || node.type === "ObjectExpression" ? "other" : "unknown"
}

// match React API calls to their imported bindings
function reactCallName(node: SyntaxNode | undefined, module: ComponentModule): string | undefined {
	if (node?.type === "Identifier") {
		return module.imports.get(syntaxName(node))
	}
	if (node?.type === "MemberExpression" && module.imports.get(syntaxName(child(node, "object"))) === "React") {
		return syntaxName(child(node, "property"))
	}

	return undefined
}

// read props from a component binding's type annotation
function componentTypeProps(node: SyntaxNode | undefined): SyntaxNode[] {
	if (node?.type !== "TSTypeReference") {
		return []
	}
	const argumentsNode = child(node, "typeArguments") ?? child(node, "typeParameters")
	return nodes(argumentsNode?.params).slice(0, 1)
}

// check directly consumed local props aliases, leaving imported and nested supporting types alone
function propsFindings({
	resolution,
	name,
	module,
}: {
	resolution: Extract<ComponentResolution, { kind: "component" }>
	name: string
	module: ComponentModule
}): ComponentDiagnostic[] {
	const expectedName = `${name}Props`
	const references = resolution.props.flatMap(propsReferences)
	const seen = new Set<string>()
	// name only directly consumed, locally declared props
	return references.flatMap((reference) => {
		const typeName = syntaxName(child(reference, "typeName"))
		if (!module.types.has(typeName) || typeName === expectedName || seen.has(typeName)) {
			return []
		}
		// report a local type once even when several annotations reference it
		seen.add(typeName)
		return [
			finding({
				node: reference,
				rule: "props-name",
				message: `Use ${expectedName} for ${name}'s local props type, found ${typeName}`,
			}),
		]
	})
}

// collect direct type references from props compositions
function propsReferences(node: SyntaxNode): SyntaxNode[] {
	if (node.type === "TSTypeReference") {
		return [node]
	}
	if (node.type === "TSIntersectionType" || node.type === "TSUnionType") {
		return nodes(node.types).flatMap(propsReferences)
	}

	return []
}

// attach a stable category and source location to each structural finding
function finding({ node, rule, message }: { node: SyntaxNode; rule: string; message: string }): ComponentDiagnostic {
	return { rule: `component/${rule}`, ...syntaxPosition(node), message }
}
