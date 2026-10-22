// guardrails: run the blocking check scripts after every file edit
export const GuardrailsPlugin = async ({ $, directory }) => {
  // tools that modify files, and the checks that gate them. apply_patch names its files inside the patch text
  const editTools = new Set(["edit", "write", "apply_patch"])
  const checks = ["scripts/check-comment-groups.sh", "scripts/check-structure.sh"]

  return {
    "tool.execute.after": async (input, output) => {
      // only gate file-modifying tools
      if (!editTools.has(input.tool)) return

      // pull the edited file paths from the tool arguments
      const toolArguments = output?.args ?? input?.args
      const filePaths =
        input.tool === "apply_patch" ? toPatchFilePaths(toolArguments?.patchText) : [toolArguments?.filePath]

      // run each check on each file. a non-zero exit throws the message back to the agent
      for (const filePath of filePaths.filter(Boolean)) {
        for (const check of checks) {
          try {
            await $`bash ${check} ${filePath}`.cwd(directory).quiet()
          } catch (error) {
            const message = error?.stderr?.toString?.() || String(error)
            throw new Error(message)
          }
        }
      }
    },
  }
}

// the files an apply_patch call adds, updates, or moves to, read from its file header lines
function toPatchFilePaths(patchText) {
  return [...String(patchText ?? "").matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map((match) =>
    match[1].trim(),
  )
}
