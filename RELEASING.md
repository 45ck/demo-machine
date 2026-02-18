# Releasing

This repo publishes to npm via GitHub Actions (`.github/workflows/release.yml`).

## Prereqs

- `NPM_TOKEN` secret set in the GitHub repo (npm automation token with publish access).

## Release Steps

1. Bump the version:

```bash
pnpm version patch
```

2. Push the commit and tag:

```bash
git push --follow-tags
```

3. Publish:

- Preferred: create a GitHub Release for the tag (triggers publish).
- Alternative: pushing a `vX.Y.Z` tag also triggers publish.
