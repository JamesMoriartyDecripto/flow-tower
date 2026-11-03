When: the task adds logic to tools/squad/run.mjs or another file near the line limit.

tools/squad/run.mjs is over 400 lines. Put new logic in the module it belongs to (oneshot.mjs for one-request
modes, skills.mjs, step-scope.mjs, config.mjs) and add only the call, a few lines, in run.mjs. If a change would
still push a file past the limit, say so in Known gaps instead of trimming unrelated code.
