# GitHub Token Setup for PR Creation

To automatically create the PR and post the § 19 checklist comment, you need a GitHub Personal Access Token (PAT).

## Quick Setup

### Option 1: Create Token via GitHub Web UI

1. Go to: https://github.com/settings/tokens/new
2. Token name: `Tippy PR Creation`
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `public_repo` (if repository is public)
4. Click "Generate token"
5. Copy the token immediately (you won't see it again)

### Option 2: Use Existing Token

If you already have a token with `repo` scope, use that.

## Set Token and Run Script

```powershell
# Set the token (replace with your actual token)
$env:GITHUB_TOKEN = "ghp_your_token_here"

# Run the PR creation script
powershell -ExecutionPolicy Bypass -File scripts/create-pr-and-comment.ps1
```

## Security Note

- Never commit tokens to the repository
- Tokens are only stored in your session environment variable
- Consider using GitHub CLI (`gh auth login`) for persistent authentication

## Alternative: Manual Creation

If you prefer not to use a token, you can:
1. Create the PR manually: https://github.com/francoisvandijk/tippy/compare/main...phase-2-payments-yoco
2. Post the checklist comment from: `docs/CHECKLIST_COMMENT_READY_TO_POST.md`

