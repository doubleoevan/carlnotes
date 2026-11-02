// the module-local syntax view used by the component checker
import { parse } from "@babel/parser"

/** A parser node with fields narrowed by the accessors below. */
export type SyntaxNode = { type: string; [field: string]: unknown }

/** A module's declarations, exported bindings, and imported React names. */
export type ComponentModule = {
	declarations: Map<string, SyntaxNode>
	types: Set<string>
	imports: Map<string, string>
	exports: { name: string; localName: string; node: SyntaxNode; isExternal: boolean }[]
}

/**
 * Parses the module's declarations and exports without resolving other files.
 */
export function parseComponentModule(fileText: string): ComponentModule {
	// parse TSX declarations and their source locations
	const program = parse(fileText, { sourceType: "module", plugins: ["typescript", "jsx"] }).program
	const module: ComponentModule = { declarations: new Map(), types: new Set(), imports: new Map(), exports: [] }
	for (const statement of nodes(program.body)) {
		readStatement(statement, module)
	}
	// retain runtime bindings when a type shares their name
	module.exports = module.exports.filter(
		({ localName, isExternal }) => isExternal || !module.types.has(localName) || module.declarations.has(localName),
	)
	return module
}

/**
 * Narrows one parser field to a syntax node.
 */
export function child(node: SyntaxNode | undefined, key: string): SyntaxNode | undefined {
	return isNode(node?.[key]) ? node[key] : undefined
}

/**
 * Narrows a parser list to its syntax nodes.
 */
export function nodes(value: unknown): SyntaxNode[] {
	return Array.isArray(value) ? value.filter(isNode) : []
}

/**
 * Returns an identifier or string-literal name.
 */
export function syntaxName(node: SyntaxNode | undefined): string {
	const name = node?.name ?? node?.value
	return typeof name === "string" ? name : ""
}

/**
 * Returns a node's one-based source position.
 */
export function syntaxPosition(node: SyntaxNode): { line: number; column: number } {
	const location = node.loc as { start?: { line: number; column: number } } | undefined
	return { line: location?.start?.line ?? 1, column: (location?.start?.column ?? 0) + 1 }
}

/**
 * Removes syntax wrappers that do not change a value's identity.
 */
export function unwrapSyntax(node: SyntaxNode | undefined): SyntaxNode | undefined {
	if (
		node &&
		["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"].includes(node.type)
	) {
		return unwrapSyntax(child(node, "expression"))
	}

	return node
}

/**
 * Returns direct child nodes, excluding comments and source metadata.
 */
export function syntaxChildren(node: SyntaxNode): SyntaxNode[] {
	return Object.entries(node).flatMap(([key, value]) => {
		if (["loc", "leadingComments", "trailingComments", "innerComments"].includes(key)) {
			return []
		}
		return isNode(value) ? [value] : nodes(value)
	})
}

// a Babel node always has a string type discriminator
function isNode(value: unknown): value is SyntaxNode {
	return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
}

// index local bindings before following their export lists
function readStatement(statement: SyntaxNode, module: ComponentModule): void {
	if (statement.type === "ExportAllDeclaration" && statement.exportKind !== "type") {
		module.exports.push({ name: "*", localName: "*", node: statement, isExternal: true })
		return
	}
	// retain imported bindings for local name resolution
	if (statement.type === "ImportDeclaration") {
		readImports(statement, module)
		return
	}
	// index exports and private declarations separately
	if (statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") {
		readExports(statement, module)
		return
	}
	readDeclaration(statement, module)
}

// retain React import aliases and distinguish shared types from local declarations
function readImports(statement: SyntaxNode, module: ComponentModule): void {
	for (const specifier of nodes(statement.specifiers)) {
		const localName = syntaxName(child(specifier, "local"))
		const importedName = syntaxName(child(specifier, "imported")) || "React"
		const source = syntaxName(child(statement, "source"))
		module.imports.set(localName, source === "react" ? importedName : "shared")
	}
}

// record export identities independently of declaration order
function readExports(statement: SyntaxNode, module: ComponentModule): void {
	const declaration = child(statement, "declaration")
	const localNames = declaration ? readDeclaration(declaration, module) : []
	if (statement.type === "ExportDefaultDeclaration" && declaration) {
		readDefaultExport(declaration, module)
		return
	}
	// type-only exports add no runtime identities
	if (statement.exportKind === "type") {
		return
	}
	// retain direct declarations and local export lists
	for (const localName of localNames) {
		module.exports.push({ name: localName, localName, node: declaration ?? statement, isExternal: false })
	}
	// retain public aliases and identify external re-exports
	for (const specifier of nodes(statement.specifiers)) {
		if (specifier.exportKind !== "type") {
			module.exports.push({
				name:
					syntaxName(child(specifier, "exported")) === "default"
						? syntaxName(child(specifier, "local"))
						: syntaxName(child(specifier, "exported")),
				localName: syntaxName(child(specifier, "local")),
				node: specifier,
				isExternal: Boolean(statement.source),
			})
		}
	}
}

// retain a default declaration without replacing a wrapped local binding
function readDefaultExport(declaration: SyntaxNode, module: ComponentModule): void {
	const localName = syntaxName(child(declaration, "id")) || syntaxName(declaration) || "default"
	if (localName === "default") {
		module.declarations.set(localName, declaration)
	}
	module.exports.push({
		name: defaultComponentName(declaration) || localName,
		localName,
		node: declaration,
		isExternal: false,
	})
}

// a named default wrapper retains the wrapped component's public identity
function defaultComponentName(node: SyntaxNode): string {
	const expression = unwrapSyntax(node) ?? node
	if (expression.type === "CallExpression") {
		const argument = nodes(expression.arguments)[0]
		return argument ? defaultComponentName(argument) : ""
	}
	return syntaxName(child(expression, "id")) || syntaxName(expression)
}

// collect runtime declarations separately from type-only declarations
function readDeclaration(declaration: SyntaxNode, module: ComponentModule): string[] {
	const name = syntaxName(child(declaration, "id"))
	if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(declaration.type)) {
		module.types.add(name)
		return []
	}
	// index each binding in a variable declaration
	if (declaration.type === "VariableDeclaration") {
		return nodes(declaration.declarations).flatMap((binding) => {
			const bindingName = syntaxName(child(binding, "id"))
			if (bindingName) {
				module.declarations.set(bindingName, binding)
			}

			return bindingName ? [bindingName] : []
		})
	}
	// retain named function and class declarations
	if (name) {
		module.declarations.set(name, declaration)
	}
	return name ? [name] : []
}
