# Git Trunk-Based Development Workflow Guide (2026 Standard)

This document outlines the standard Trunk-Based Development (TBD) workflow for modern agency monorepos (Medusa v2 + Next.js 14+). 

---

## 1. Validity in 2026

* **Short-lived feature branches:** Branches live for hours or a few days at most.
* **Continuous Integration:** Every branch push runs automated Vitest tests, ESLint, and TypeScript typechecking.
* **Zero Merge Conflicts:** Frequent, incremental merges keep local code aligned with `main`.
* **Instant CD Deployments:** Merges to `main` automatically trigger database migrations and edge deployments (Vercel / Render).

---

## 2. Step-by-Step Trunk Workflow

### Phase Step 1: Sync Your Local Main
Always ensure your local `main` branch is clean and synced with the remote repository before creating a new feature branch.

```powershell
# 1. Switch to local main branch
git checkout main

# 2. Fetch and pull the latest changes from GitHub
git pull origin main
```

---

### Phase Step 2: Create a Short-Lived Feature Branch
Create a descriptive branch dedicated to a specific Phase or task from your `TODO.md`.

```powershell
# Create and switch to a feature branch for Phase 1
git checkout -b feature/phase-1-security-routing

# Alternatively, for Phase 2:
# git checkout -b feature/phase-2-core-ecommerce
```

---

### Phase Step 3: Publish Branch to GitHub
Push the new branch to GitHub to enable remote tracking and CI status updates.

```powershell
git push -u origin feature/phase-1-security-routing
```

---

### Phase Step 4: Develop, Test & Commit Locally
Work on your code incrementally. Run local unit tests and linting before committing.

```powershell
# Check changed files
git status

# Stage all updated files
git add .

# Create a structured conventional commit
git commit -m "feat(security): configure next.js security headers and CSP directives"

# Push commits to remote feature branch
git push
```

---

### Phase Step 5: Merge into `main` (Trunk)

When the phase tasks are complete and verified:

#### Option A: GitHub Pull Request (Recommended for Team & Agency Audits)
1. Navigate to GitHub $\rightarrow$ **Pull Requests** $\rightarrow$ **New Pull Request**.
2. Select `base: main` $\leftarrow$ `compare: feature/phase-1-security-routing`.
3. Wait for GitHub Actions (Typecheck, Vitest, Lint) to pass green.
4. Click **Squash and Merge** (or **Merge Pull Request**).

#### Option B: Fast-Forward Local Merge (Solo Dev Workflow)
```powershell
# 1. Switch back to main
git checkout main

# 2. Pull latest main changes
git pull origin main

# 3. Merge feature branch into main
git merge feature/phase-1-security-routing

# 4. Push updated main to trigger CD deployments
git push origin main
```

---

### Phase Step 6: Cleanup Short-Lived Branch
Delete the branch locally and remotely to maintain repository hygiene.

```powershell
# Delete local branch
git branch -d feature/phase-1-security-routing

# Delete remote branch on GitHub
git push origin --delete feature/phase-1-security-routing
```

---

## 3. Branch Naming Cheat Sheet

| Task Category | Example Branch Name | Example Commit Message |
| :--- | :--- | :--- |
| **Phase 1: Security & i18n** | `feature/phase-1-security` | `feat(security): setup upstash rate limiting middleware` |
| **Phase 2: Algerian Logic** | `feature/phase-2-wilaya-rates` | `feat(algeria): implement 58 wilaya shipping rate calculator` |
| **Phase 3: UI & Sanity** | `feature/phase-3-cart-drawer` | `feat(storefront): add slide-out cart drawer with optimistic state` |
| **Bug Fixes** | `fix/eslint-ci-crash` | `fix(ci): update storefront to eslint v9 flat config` |