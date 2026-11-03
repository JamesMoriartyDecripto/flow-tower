When: a TypeScript test or module imports a plain .mjs module of tools/squad/.

Most runner modules are plain JavaScript without declarations (#404, #412: five RED steps before tasks said so):
- If the module has a `.d.mts` next to it (config, batch, mode, skills), import it normally.
- Otherwise put `// @ts-expect-error plain .mjs without declarations` on the line above the import.
- Annotate callback parameters of values from such a module (`(x: string) => …`): implicit any is an error.
- A new .mjs that TypeScript code imports gets its own `.d.mts` declaring every export.
