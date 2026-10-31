# <issue>-<nn>: <what this step delivers, in one line>

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to the new one only).
Read <the files the coder needs to understand first>.
Verify: `run check`; `finish` with the output and a `Known gaps:` line.

<Why this step exists: the problem, with file:line references and the exact current text of any message you want changed.>

1. <file>: <the change, precise enough that a green check means it is done>.
2. New file <tests/…>: <the cases that prove item 1, each with its input and expected result>.

Files: <path>, <new/path>+, <path that may stay untouched> (optional)
