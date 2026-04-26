# Releasing

This repo currently releases from the local checkout. GitHub Actions workflows have been removed, so publishing is manual until a maintainer reintroduces a release pipeline.

## Prereqs

- Logged in to npm locally with an account that can publish `demo-machine`.
- Clean `master` checkout with local verification complete.

## Release Steps

1. Verify locally:

```bash
pnpm install
pnpm release-ready
```

Use `pnpm release-ready:fast` when you need the non-rendering release gates only. It still checks external tool availability, gallery consistency, build/validate, example validation, and package dry-run readiness.

2. Bump the version:

```bash
pnpm version patch
```

3. Publish from the local checkout:

```bash
pnpm publish
```

4. Push the release commit and tag:

```bash
git push --follow-tags
```
