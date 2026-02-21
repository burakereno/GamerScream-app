---
description: Release a new version of GamerScream desktop app
---

# GamerScream Release Workflow

This workflow handles the full release process for GamerScream desktop app. Run this when the user says "uygulamayı güncelle" or "release new version".

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

### 3. Update web download links

In the web project at `/Users/burakerenoglu/Documents/Gemini/GamerScream-web/app/page.tsx`, update the download URLs:

- Mac link: `GamerScream-OLD_VERSION-arm64.dmg` → `GamerScream-NEW_VERSION-arm64.dmg`
- Windows link: `GamerScream-Setup-OLD_VERSION.exe` → `GamerScream-Setup-NEW_VERSION.exe`

### 4. Build and verify server (if server code changed)

```bash
cd /Users/burakerenoglu/Documents/Gemini/GamerScream && pnpm --filter server build
```

If server code changed, also deploy to production:

```bash
scp -i /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/desktop/build/ssh-key-2026-02-20.key -r /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/server/dist/* ubuntu@144.24.183.24:~/gamerscream/dist/
ssh -i /Users/burakerenoglu/Documents/Gemini/GamerScream/apps/desktop/build/ssh-key-2026-02-20.key ubuntu@144.24.183.24 "sudo systemctl restart gamerscream && sleep 2 && curl -s http://localhost:3002/api/health"
```

### 5. Commit, tag, and push BOTH repos

**App repo:**
```bash
cd /Users/burakerenoglu/Documents/Gemini/GamerScream
git add -A
git commit -m "v${NEW_VERSION}"
git tag v${NEW_VERSION}
git push origin main --tags
```

**Web repo:**
```bash
cd /Users/burakerenoglu/Documents/Gemini/GamerScream-web
git add -A
git commit -m "update download links to v${NEW_VERSION}"
git push origin main
```

### 5. Verify GitHub Actions

- The push with the `v*` tag triggers the `Build & Release` workflow
- This builds Mac (`.dmg`) and Windows (`.exe`) installers
- The built files are automatically uploaded as a new GitHub Release
- Web download links point to `/releases/latest` so they auto-update — no changes needed

### 6. Server deployment reminder

If server changes were made, remind the user:
- Production server at `144.24.183.24` was updated in Step 3
- Verify with: `curl -s https://gamerscream.burakereno.com/api/health`

### 7. Report to user

List what was done:
- Old version → New version
- Files changed
- GitHub Actions status link: `https://github.com/burakereno/GamerScream-app/actions`
- Release page: `https://github.com/burakereno/GamerScream-app/releases/latest`
