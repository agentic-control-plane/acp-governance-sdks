# Publishing to npm

The first `npm publish` under `@agenticcontrolplane` locks the scope to whichever npm account does it. Make sure you publish from the account you want to own the scope long-term.

## One-time setup

```bash
# Confirm npm login
npm whoami
# If 401, log in:
npm login

# Optionally scope-bind your login (not required, but documents intent):
npm login --scope=@agenticcontrolplane --registry=https://registry.npmjs.org/
```

## Publish each package

The packages have `publishConfig.provenance: true` which requires GitHub Actions OIDC. For the **first manual publish**, drop provenance temporarily:

```bash
cd packages/governance
npm publish --access public --no-provenance

cd ../governance-anthropic
npm publish --access public --no-provenance
```

For subsequent versions, set up `.github/workflows/publish.yml` and let CI publish with `--provenance` enabled (npm will show a verified-build badge on the package page).

## Verify

```bash
npm view @agenticcontrolplane/governance
npm view @agenticcontrolplane/governance-anthropic
```

Both should show v0.1.0 with the README and dist files.

## After publish

Update the marketing site integration pages (`/integrations/anthropic-agent-sdk`, `/integrations/crewai`, `/integrations/langgraph`, `/integrations/openai-agents-sdk`) to remove the "pre-release" caveats and link directly to the npm packages.
