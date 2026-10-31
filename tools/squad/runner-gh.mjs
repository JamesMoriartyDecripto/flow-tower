// The GitHub calls of the unattended lead (#320): poll the queue, claim an issue, comment, mark a failure, open a
// draft PR, hand the issue to review. Every call goes through one injected exec(cmd, args, opts) -> { status, stdout,
// stderr }, so the tests never reach GitHub. Arguments are always arrays, never a shell string, and no body or reason
// ever lands in an argument: bodies go on stdin (--body-file -), so they cannot be read as flags.

// A failed gh call throws with the subcommand and the first stderr line. The stderr is only the first line, so a long
// gh trace does not flood the lead's log.
function firstLine(text) {
  return String(text ?? '').split('\n')[0].trim();
}

export function makeGh(exec, repo) {
  // Every call names the repo with -R, so a runner in one checkout cannot act on another repository by accident. The
  // -R sits right after the positional arguments (the issue number), as in `gh issue edit <n> -R <repo> ...`.
  const gh = (sub, pos, flags, opts = {}) => {
    const r = exec('gh', [...sub, ...pos, '-R', repo, ...flags], opts);
    if (r.status !== 0) throw new Error(`gh ${sub.join(' ')} failed: ${firstLine(r.stderr)}`);
    return r.stdout;
  };

  const labelsOf = (n) => {
    const v = JSON.parse(gh(['issue', 'view'], [String(n)], ['--json', 'labels']));
    return (v.labels ?? []).map((l) => l.name);
  };

  // Oldest first, so an issue waiting longest is claimed first.
  function queue(label = 'squad:go') {
    const items = JSON.parse(gh(['issue', 'list'], [],
      ['--label', label, '--state', 'open', '--json', 'number,title,body,labels,createdAt', '--limit', '50']));
    return items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  // The swap is not atomic, so another runner may have claimed the issue in between. The labels are read back: only
  // a claim that still shows squad:running and no squad:go counts as ours.
  function claim(n) {
    gh(['issue', 'edit'], [String(n)], ['--add-label', 'squad:running', '--remove-label', 'squad:go']);
    const labels = labelsOf(n);
    return labels.includes('squad:running') && !labels.includes('squad:go');
  }

  // The body goes on stdin, so it never appears in the argument list.
  function comment(n, body) {
    gh(['issue', 'comment'], [String(n)], ['--body-file', '-'], { input: body });
  }

  // Comment first, so the reason is on the issue even if the label swap fails after it.
  function fail(n, reason) {
    comment(n, `Dev Squad stopped: ${reason}`);
    gh(['issue', 'edit'], [String(n)], ['--add-label', 'squad:failed', '--remove-label', 'squad:running']);
  }

  function draftPr({ branch, base, title, bodyFile }) {
    const out = gh(['pr', 'create'], [], ['--draft', '--head', branch, '--base', base, '--title', title, '--body-file', bodyFile]);
    return out.trim();
  }

  function done(n) {
    gh(['issue', 'edit'], [String(n)], ['--remove-label', 'squad:running', '--add-label', 'squad:review']);
  }

  return { queue, claim, comment, fail, draftPr, done };
}
