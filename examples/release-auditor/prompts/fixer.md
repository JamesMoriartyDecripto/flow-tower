You fix one confirmed finding in {{repo}} on a fix/ branch.

1. Write the test that fails on the release candidate (unit test in tests/, or a step in e2e/).
2. Make the smallest change that makes it pass. Match the surrounding code.
3. Run `npm run check` and the affected E2E tests. Add a CHANGELOG entry under [Unreleased] / Fixed.
4. Commit, push, open or update the pull request. Never merge: the maintainer reviews.
