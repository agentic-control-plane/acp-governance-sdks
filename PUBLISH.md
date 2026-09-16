# Publishing to npm

Two packages publish from this repo: `@agenticcontrolplane/governance` and
`@agenticcontrolplane/governance-anthropic`. The root package is private.

## How the tarball is built

Both packages declare a `prepack` script that runs `npm run clean && npm run build`.
npm runs `prepack` before both `npm pack` and `npm publish`, so the tarball always
contains a fresh compile of `src/` and nothing else. `dist/` is gitignored; whatever is
sitting in it locally is discarded and rebuilt at pack time. Do not bypass this with
`--ignore-scripts`.

The tarball contains `dist/`, `src/` (referenced by the source maps in `dist/`), and
`README.md`. Test files (`src/**/*.test.ts`) are excluded by `files`.

## Before every release

```bash
# From the repo root, on a clean checkout:
npm ci
npm run typecheck
npm test
```

`npm ci` must succeed as-is. If it reports the lock file is out of sync (for example
after bumping a package version), run `npm install` at the root and commit the updated
`package-lock.json`. `governance-anthropic` depends on `governance` with a `^` range, so
the workspace link stays satisfied across patch and minor bumps.

## Release order

`governance-anthropic` depends on `@agenticcontrolplane/governance`. When both change,
publish `governance` first, then `governance-anthropic`, so the adapter's dependency
range resolves on the registry.

## Dry run

Pack each package and inspect the file list before publishing:

```bash
cd packages/governance && npm pack --dry-run
cd ../governance-anthropic && npm pack --dry-run
```

Expected contents: `package.json`, `README.md`, `dist/*.js`, `dist/*.d.ts`, the
corresponding `.map` files, and `src/*.ts` with no `*.test.ts`. If anything else
appears, the `files` allowlist or `tsconfig.json` `exclude` needs fixing before you
publish.

For a full out-of-tree check, pack for real and install the tarball into a scratch
project (use an absolute path):

```bash
cd packages/governance && npm pack
W=$(mktemp -d) && cd "$W" && npm init -y >/dev/null
npm i /abs/path/to/agenticcontrolplane-governance-<version>.tgz
node -e "import('@agenticcontrolplane/governance').then(m => console.log(Object.keys(m)))"
```

Delete the `.tgz` afterwards; tarballs are not committed.

## Publish

```bash
npm whoami            # log in with `npm login` if this returns 401

cd packages/governance
npm publish --access public

cd ../governance-anthropic
npm publish --access public
```

`publishConfig.provenance: true` requires a CI OIDC token. When publishing by hand from a
terminal, add `--no-provenance`. Publishing from the workspace directory is required;
`npm publish` at the root does nothing because the root is private.

## Verify

```bash
npm view @agenticcontrolplane/governance version dist.fileCount
npm view @agenticcontrolplane/governance-anthropic version dist.fileCount
```

The versions must match the `version` fields in each `package.json`, and the file
counts must match what `npm pack --dry-run` reported.
