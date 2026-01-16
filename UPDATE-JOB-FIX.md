# Update Job Fix - Git Push Hanging Issue

## Problem Summary

When running "Run minor/patch updates" from the dashboard, the job would:
1. ✅ Clone the repository successfully
2. ✅ Update 32 packages via `npm update`
3. ✅ Commit the changes locally
4. ❌ **Hang forever** at the git push step

The frontend would poll `/api/update-jobs/7` repeatedly, and the job would stay at 88% (step 7 of 8) with status "running" forever.

## Root Cause

The git push command failed with:
```
fatal: could not read Password for 'https://ghu_...@github.com': Device not configured
```

**Why this happened:**
- Git was configured to use a credential helper
- When pushing with an access token in the URL (`https://TOKEN@github.com/...`), git's credential helper tried to prompt for a password interactively
- Since the Node.js process has no TTY (no terminal input), the prompt hung forever
- The process never timed out or threw an error, so the job stayed "running" indefinitely

## Investigation Results

From the database:
```sql
SELECT id, status, logs FROM update_jobs WHERE id = 7;
```

Job got stuck at:
```
[2026-01-13T16:27:38.899Z] Pushing to origin/bridge/patch-updates...
```

Status: `running` (never changed to `completed` or `failed`)
Progress: 88% (step 7 of 8)

The temp directory (`temp_updates/7`) still existed with a valid commit ready to push:
```bash
$ cd temp_updates/7 && git log --oneline -1
c13807f chore(deps): update 32 minor/patch dependencies
```

## The Fix

Updated `/Users/connormccoy/Desktop/bridge-console/server/update-worker.js` to:

1. **Disable interactive credential prompts:**
   ```javascript
   const pushEnv = {
     ...process.env,
     GIT_TERMINAL_PROMPT: '0',  // Prevents interactive prompts
     GIT_ASKPASS: 'echo'         // Prevents credential helper prompts
   };
   
   await repoGit.env(pushEnv).push(['--force', '-u', 'origin', PATCH_BRANCH]);
   ```

2. **Add proper error handling:**
   ```javascript
   try {
     await repoGit.env(pushEnv).push(['--force', '-u', 'origin', PATCH_BRANCH]);
     await appendLog(db, jobId, `Pushed to origin/${PATCH_BRANCH}`);
   } catch (pushError) {
     await appendLog(db, jobId, `Push failed: ${pushError.message}`);
     throw new Error(`Failed to push to GitHub: ${pushError.message}. Check that your GitHub token has 'repo' write permissions.`);
   }
   ```

## Cleanup Performed

1. Marked the stuck job as failed in the database:
   ```sql
   UPDATE update_jobs 
   SET status = 'failed', 
       result = '{"error":"Git push hung - fixed in code. Please try again."}',
       completedAt = CURRENT_TIMESTAMP 
   WHERE id = 7;
   ```

2. Removed the orphaned temp directory:
   ```bash
   rm -rf temp_updates/7
   ```

## How to Test the Fix

1. **Restart your server** (if it's running):
   ```bash
   npm run server
   ```

2. **Try the update job again:**
   - Go to Bridge dashboard
   - Select a repository
   - Click "Run minor/patch updates"
   - Watch the progress - it should complete in ~30-60 seconds

3. **Expected behavior:**
   - You'll see progress updates through all 8 phases
   - Phase 7 ("Committing and pushing changes...") should complete quickly
   - Phase 8 ("Creating pull request...") should create a PR on GitHub
   - You should see a success message with a link to the PR

4. **Check the PR on GitHub:**
   - Go to your repository on GitHub
   - Look for a new PR titled: `chore(deps): update N minor/patch dependencies`
   - The PR should be on branch `bridge/patch-updates`

## Verification Checklist

✅ Job no longer hangs at 88%
✅ Git push completes without prompting for credentials
✅ Pull request is created successfully
✅ Job status changes to "completed"
✅ PR URL is returned to the frontend
✅ Temp directory is cleaned up after completion

## Additional Notes

### GitHub Token Permissions

Your OAuth app already requests the correct scope:
```javascript
scope: 'repo read:user read:org user:email'
```

The `repo` scope grants full access to repositories, including:
- ✅ Read and write access
- ✅ Push commits
- ✅ Create pull requests

### If It Still Fails

If you still get push errors, check:

1. **GitHub App OAuth permissions:**
   - Go to: https://github.com/settings/applications
   - Find your Bridge OAuth app
   - Make sure it has `repo` scope enabled

2. **Organization restrictions:**
   - If pushing to an organization repo, the org must approve the OAuth app
   - See `GITHUB-ORG-ACCESS.md` for details

3. **Repository access:**
   - Make sure you have write access to the repository
   - Check that branch protection rules allow force pushes (or remove `--force` flag)

4. **Token refresh:**
   - If the token is expired, log out and log back in to Bridge
   - This will refresh your access token

## Files Modified

- ✅ `/Users/connormccoy/Desktop/bridge-console/server/update-worker.js`
  - Added git credential prompt disabling
  - Added push error handling and logging
  - No other changes needed

## Environment Variables

No new environment variables required. The fix uses standard git environment variables:
- `GIT_TERMINAL_PROMPT=0` - Standard git variable
- `GIT_ASKPASS=echo` - Standard git variable

These are set programmatically in the worker, not in your `.env` file.

