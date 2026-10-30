// the built output rule flags a package the build leaves external that the app does not declare
import { expect, test } from "bun:test"
import { toUndeclaredBuiltImports } from "./builtDependencies"

// an undeclared package fails once, naming its first file, and relative paths, built-ins, and comments pass
test("toUndeclaredBuiltImports flags an undeclared external and passes declared ones, built-ins, and comments", () => {
	const builtFiles = [
		{
			filePath: "apps/web/dist/server/assets/storeListeners.js",
			fileText:
				'import { z } from "zod"\nimport { a } from "./chunk.js"\nimport { join } from "node:path"\n/** import { useStore } from "nanostores/react" */\n',
		},
		{ filePath: "apps/web/dist/server/server.js", fileText: 'import { z } from "zod"\nimport React from "react"\n' },
	]

	// zod fails, named at the first file that imports it
	expect(toUndeclaredBuiltImports({ builtFiles, dependencyNames: new Set(["react"]) })).toEqual([
		"apps/web/dist/server/assets/storeListeners.js imports zod",
	])

	// zod declared passes
	expect(toUndeclaredBuiltImports({ builtFiles, dependencyNames: new Set(["react", "zod"]) })).toEqual([])
})
