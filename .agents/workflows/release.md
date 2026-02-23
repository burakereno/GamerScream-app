---
description: Release a new version of GamerScream desktop app
---

# GamerScream Release Workflow

This workflow handles the full release process for GamerScream desktop app. Run this when the user says "uygulamayı güncelle" or "release new version".

> **CRITICAL:** Artifact names are version-independent. Do NOT add version numbers to artifact names.
> - Mac: `GamerScream.dmg` (set in `electron-builder.yml` → `mac.artifactName`)
> - Windows: `GamerScream-Setup.exe` (set in `electron-builder.yml` → `win.artifactName`)
> - Web links use `/releases/latest/download/GamerScream.dmg` and `/releases/latest/download/GamerScream-Setup.exe`
> - These auto-resolve to the latest release. **NEVER update download links in the web repo.**

## Steps

// turbo-all

### 1. Determine the new version

- Read the current version from `apps/desktop/package.json` → `version` field
- If the user specified a version, use that
- Otherwise, **auto-increment the patch version** (e.g., `1.0.0` → `1.0.1`, `1.1.0` → `1.1.1`)
- If changes include new features, increment minor (e.g., `1.0.1` → `1.1.0`)
- Store the new version as `NEW_VERSION`

### 2. Update version in all files

Update the version string in these files:

```
apps/desktop/package.json          → "version": "NEW_VERSION"
apps/server/package.json           → "version": "NEW_VERSION"
apps/desktop/src/renderer/App.tsx  → const APP_VERSION = 'NEW_VERSION'
```

### 3. Build and verify server (if server code changed)

```bash
cd /Users/burakerenoglu/Documents/Gemini/GamerScream && pnpm --filter server build
```

If server code changed, also deploy to production:

```bash
scp -i /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/desktop/build/ssh-key-2026-02-20.key -r /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/server/dist/* ubuntu@144.24.183.24:~/gamerscream/dist/
ssh -i /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/desktop/build/ssh-key-2026-02-20.key ubuntu@144.24.183.24 "sudo systemctl restart gamerscream && sleep 2 && curl -s http://localhost:3002/api/health"
```

### 4. Commit, tag, and push

```bash
cd /Users/burakerenoglu/Documents/Gemini/GamerScream
git add -A
git commit -m "v${NEW_VERSION}"
git tag v${NEW_VERSION}
git push origin main --tags
```

### 5. Verify GitHub Actions build

- The push with the `v*` tag triggers the `Build & Release` workflow
- Check status: `https://github.com/burakereno/GamerScream-app/actions`
- Wait for **both** Mac and Windows builds to complete (~5-10 min)
- Verify the release has the correct artifact names:
  - `GamerScream.dmg` (NOT `GamerScream-X.X.X-arm64.dmg`)
  - `GamerScream-Setup.exe` (NOT `GamerScream-Setup-X.X.X.exe`)

### 6. Verify web download links work

After the GitHub Actions build completes, verify that web download links resolve correctly:

```bash
curl -sI "https://github.com/burakereno/GamerScream-app/releases/latest/download/GamerScream.dmg" | head -3
curl -sI "https://github.com/burakereno/GamerScream-app/releases/latest/download/GamerScream-Setup.exe" | head -3
```

Both should return **302 redirect** (not 404). If they return 404:
- Check that the build completed successfully
- Check that `electron-builder.yml` artifact names don't include `${version}`
- The web page at `/Users/burakerenoglu/Documents/Gemini/GamerScream-web/app/page.tsx` should NOT need any changes

### 7. Server deployment reminder

If server changes were made, remind the user:
- Production server at `144.24.183.24` was updated in Step 3
- Verify with: `curl -s https://gamerscream.burakereno.com/api/health`

### 8. Report to user

List what was done:
- Old version → New version
- Files changed
- GitHub Actions status link: `https://github.com/burakereno/GamerScream-app/actions`
- Release page: `https://github.com/burakereno/GamerScream-app/releases/latest`
- Download link verification results
