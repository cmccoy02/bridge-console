/**
 * Automation Scheduler
 * Runs periodic checks for scheduled automations and triggers them
 */

import { getDb } from './db.js';
import { processScan } from './worker.js';
import { processUpdate } from './update-worker.js';

// Track running jobs to prevent duplicates
const runningJobs = new Set();

// Scheduler interval (check every minute)
const CHECK_INTERVAL = 60 * 1000;

/**
 * Check if a scheduled time matches the current time
 */
function isTimeToRun(frequency, dayOfWeek, dayOfMonth, scheduledTime, lastRunDate = null) {
  const now = new Date();
  const currentDay = now.getDay(); // 0-6, Sunday = 0
  const currentDate = now.getDate(); // 1-31
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Parse scheduled time (HH:MM format)
  let scheduledHour = 9;
  let scheduledMinute = 0;
  if (scheduledTime) {
    const [h, m] = scheduledTime.split(':').map(Number);
    scheduledHour = h || 9;
    scheduledMinute = m || 0;
  }

  // Check if within the scheduled time window (5 minute window)
  const isTimeMatch = currentHour === scheduledHour &&
                      Math.abs(currentMinute - scheduledMinute) <= 2;

  if (!isTimeMatch) {
    return false;
  }

  // Check frequency
  switch (frequency) {
    case 'daily':
      // Run every day at the scheduled time
      return true;

    case 'weekly':
      // Run on the specified day of week
      return currentDay === (dayOfWeek || 0);

    case 'monthly':
      // Run on the specified day of month
      return currentDate === (dayOfMonth || 1);

    case 'manual':
    default:
      return false;
  }
}

/**
 * Get repositories with their automation settings and user tokens
 */
async function getScheduledAutomations(db) {
  try {
    const automations = await db.all(`
      SELECT
        r.id as "repositoryId",
        r."repoUrl",
        r.name as "repoName",
        r."userId",
        u."accessToken",
        u.username,
        a."scanEnabled",
        a."scanFrequency",
        a."scanDayOfWeek",
        a."scanDayOfMonth",
        a."scanTime",
        a."patchEnabled",
        a."patchFrequency",
        a."patchDayOfWeek",
        a."patchDayOfMonth",
        a."patchTime",
        a."patchAutoMerge",
        a."reportEnabled",
        a."reportFrequency",
        a."reportDayOfWeek",
        a."reportDayOfMonth",
        a."reportTime"
      FROM repositories r
      JOIN automation_settings a ON r.id = a."repositoryId"
      JOIN users u ON r."userId" = u.id
      WHERE r."isActive" = 1
        AND u."accessToken" IS NOT NULL
        AND (a."scanEnabled" = 1 OR a."patchEnabled" = 1 OR a."reportEnabled" = 1)
    `);

    return automations || [];
  } catch (error) {
    console.error('[Scheduler] Error fetching automations:', error.message);
    return [];
  }
}

/**
 * Check if a job was recently run (within last hour)
 */
async function wasRecentlyRun(db, repositoryId, jobType) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    if (jobType === 'scan') {
      const recent = await db.get(
        `SELECT id FROM scans WHERE "repositoryId" = ? AND "createdAt" > ? LIMIT 1`,
        [repositoryId, oneHourAgo]
      );
      return !!recent;
    }

    if (jobType === 'update') {
      const recent = await db.get(
        `SELECT id FROM update_jobs WHERE "repositoryId" = ? AND "createdAt" > ? LIMIT 1`,
        [repositoryId, oneHourAgo]
      );
      return !!recent;
    }

    return false;
  } catch (error) {
    console.error('[Scheduler] Error checking recent jobs:', error.message);
    return true; // Assume recently run to avoid duplicate runs on error
  }
}

/**
 * Trigger a health scan for a repository
 */
async function triggerScan(db, automation) {
  const jobKey = `scan-${automation.repositoryId}`;

  if (runningJobs.has(jobKey)) {
    console.log(`[Scheduler] Scan already running for ${automation.repoName}`);
    return;
  }

  // Check if recently run
  if (await wasRecentlyRun(db, automation.repositoryId, 'scan')) {
    console.log(`[Scheduler] Scan was recently run for ${automation.repoName}, skipping`);
    return;
  }

  console.log(`[Scheduler] Triggering scheduled scan for ${automation.repoName}`);
  runningJobs.add(jobKey);

  try {
    // Create scan entry
    const result = await db.run(
      'INSERT INTO scans ("repositoryId", "repoUrl", status) VALUES (?, ?, ?)',
      [automation.repositoryId, automation.repoUrl, 'processing']
    );

    const scanId = result.lastID;
    console.log(`[Scheduler] Created scan job ${scanId} for ${automation.repoName}`);

    // Run scan with user's token
    processScan(scanId, automation.repoUrl, automation.repositoryId, db, automation.accessToken)
      .catch(err => console.error(`[Scheduler] Scan error for ${automation.repoName}:`, err.message))
      .finally(() => runningJobs.delete(jobKey));

  } catch (error) {
    console.error(`[Scheduler] Failed to trigger scan for ${automation.repoName}:`, error.message);
    runningJobs.delete(jobKey);
  }
}

/**
 * Trigger a patch update for a repository
 */
async function triggerUpdate(db, automation) {
  const jobKey = `update-${automation.repositoryId}`;

  if (runningJobs.has(jobKey)) {
    console.log(`[Scheduler] Update already running for ${automation.repoName}`);
    return;
  }

  // Check if recently run
  if (await wasRecentlyRun(db, automation.repositoryId, 'update')) {
    console.log(`[Scheduler] Update was recently run for ${automation.repoName}, skipping`);
    return;
  }

  console.log(`[Scheduler] Triggering scheduled update for ${automation.repoName}`);
  runningJobs.add(jobKey);

  try {
    // Create update job entry
    const result = await db.run(
      'INSERT INTO update_jobs ("repositoryId", "userId", status) VALUES (?, ?, ?)',
      [automation.repositoryId, automation.userId, 'pending']
    );

    const jobId = result.lastID;
    console.log(`[Scheduler] Created update job ${jobId} for ${automation.repoName}`);

    // Get repository info
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ?',
      [automation.repositoryId]
    );

    // Run update with user's token
    processUpdate(jobId, repo, automation.accessToken, db)
      .catch(err => console.error(`[Scheduler] Update error for ${automation.repoName}:`, err.message))
      .finally(() => runningJobs.delete(jobKey));

  } catch (error) {
    console.error(`[Scheduler] Failed to trigger update for ${automation.repoName}:`, error.message);
    runningJobs.delete(jobKey);
  }
}

/**
 * Main scheduler check - runs every minute
 */
async function runSchedulerCheck() {
  try {
    const db = await getDb();
    const automations = await getScheduledAutomations(db);

    if (automations.length === 0) {
      return;
    }

    console.log(`[Scheduler] Checking ${automations.length} automation configurations...`);

    for (const automation of automations) {
      // Check if scan is due
      if (automation.scanEnabled && isTimeToRun(
        automation.scanFrequency,
        automation.scanDayOfWeek,
        automation.scanDayOfMonth,
        automation.scanTime
      )) {
        await triggerScan(db, automation);
      }

      // Check if patch update is due
      if (automation.patchEnabled && isTimeToRun(
        automation.patchFrequency,
        automation.patchDayOfWeek,
        automation.patchDayOfMonth,
        automation.patchTime
      )) {
        await triggerUpdate(db, automation);
      }

      // TODO: Add report generation when implemented
      // if (automation.reportEnabled && isTimeToRun(...)) {
      //   await triggerReport(db, automation);
      // }
    }

  } catch (error) {
    console.error('[Scheduler] Check failed:', error.message);
  }
}

// Track scheduler interval
let schedulerInterval = null;

/**
 * Start the scheduler
 */
export function startScheduler() {
  if (schedulerInterval) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log('[Scheduler] Starting automation scheduler (checking every minute)');

  // Run immediately on start
  runSchedulerCheck();

  // Then run every minute
  schedulerInterval = setInterval(runSchedulerCheck, CHECK_INTERVAL);
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: !!schedulerInterval,
    activeJobs: Array.from(runningJobs),
    checkInterval: CHECK_INTERVAL
  };
}

/**
 * Manually trigger a check (for testing)
 */
export async function triggerManualCheck() {
  await runSchedulerCheck();
}
