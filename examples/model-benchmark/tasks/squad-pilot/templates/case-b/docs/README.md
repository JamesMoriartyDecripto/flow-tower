# File guard

`src/guard.mjs` exports `resolveInside(root, requested)`, used by a file server to map a request
to a path under its `root` folder. It is pure: it computes a path and never touches the disk.

Intended behaviour: a path under `root` is returned as an absolute path. A path that leaves `root`,
including a sibling folder whose name starts with the same text (`/srv/files-private` next to `/srv/files`),
is refused with an error whose message contains `escapes`.
