When: the task edits a bash script (tools/squad/steps.sh, ev.sh, any *.sh).

macOS ships bash 3.2, and the squad runs there (#396, #403). Keep scripts working on it:
- No `mapfile` / `readarray`: read lines with `while IFS= read -r line; do …; done`.
- No `${var,,}` / `${var^^}` case changes: use `tr '[:upper:]' '[:lower:]'`.
- No associative arrays (`declare -A`).
- With `set -u`, an empty array fails on `"${a[@]}"`: guard with `${a[@]+"${a[@]}"}` or check the length first.
- `mktemp` templates end in `X` characters (BSD mktemp needs them at the end).
