// guardrails: run the blocking check scripts after every file edit
export const GuardrailsPlugin = async ({ $, directory }) => {
  // tools that modify files, and the checks that gate them
  const editTools = new Set(["edit", "write", "patch"])
  const checks = ["scripts/check-comment-groups.sh", "scripts/check-structure.sh"]

  return {
    "tool.execute.after": async (input, output) => {
      // only gate file-modifying tools
      if (!editTools.has(input.tool)) return

      // pull the edited file path from the tool arguments
      const filePath = output?.args?.filePath ?? input?.args?.filePath
      if (!filePath) return

      // run each check; a non-zero exit throws the message back to the agent
      for (const check of checks) {
        try {
          await $`bash ${check} ${filePath}`.cwd(directory).quiet()
        } catch (error) {
          const message = error?.stderr?.toString?.() || String(error)
          throw new Error(message)
        }
      }
    },
  }
}