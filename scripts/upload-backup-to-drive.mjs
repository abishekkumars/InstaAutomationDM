import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const backupFile = process.env.BACKUP_FILE;
const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const googleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

/** How long a backup is kept before the cleanup pass removes it. Three months by default;
 * override with BACKUP_RETENTION_DAYS. Set to 0 to disable cleanup entirely. */
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 90);

/** Never remove fewer than this many of the newest backups, no matter how old they are.
 *
 * This is the guard that matters. If the workflow stops running for four months and then
 * succeeds once, every existing backup is older than the retention window - and a naive
 * "delete everything past 90 days" would delete all of them, leaving exactly one backup that is
 * minutes old. Keeping a floor means the cleanup can never leave you with less history than
 * this, whatever the dates say. */
const MIN_BACKUPS_KEPT = 7;

/** Only files this script itself produces are eligible for deletion. The workflow names them
 * `postgres_<timestamp>.sql.gz`; anything else in the folder is somebody else's and is left
 * alone even though the service account may be able to see it. */
const BACKUP_NAME_PATTERN = /^postgres_.*\.sql\.gz$/;

if (!backupFile) {
  console.error('ERROR: BACKUP_FILE is not set.');
  process.exit(1);
}

if (!googleServiceAccountJson) {
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON is not set.');
  process.exit(1);
}

if (!googleDriveFolderId) {
  console.error('ERROR: GOOGLE_DRIVE_FOLDER_ID is not set.');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`ERROR: Backup file does not exist: ${backupFile}`);
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(googleServiceAccountJson);
} catch {
  // The parse error itself is deliberately not logged: its message can echo back a fragment of
  // the secret it failed to parse, and this runs in a GitHub Actions log.
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  process.exit(1);
}

if (!serviceAccount.client_email || !serviceAccount.private_key) {
  console.error('ERROR: Service account JSON must contain client_email and private_key.');
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({
  version: 'v3',
  auth,
});

/** Removes backups older than RETENTION_DAYS from the configured Drive folder.
 *
 * Four separate constraints bound what this can delete, because an automated deleter running
 * unattended against your only backups deserves them:
 *
 *  1. Only the configured folder (`'<folderId>' in parents`).
 *  2. Only files matching BACKUP_NAME_PATTERN - this script's own output, not whatever else
 *     happens to live there.
 *  3. Only files older than the retention window, by Drive's own `createdTime`.
 *  4. Never the newest MIN_BACKUPS_KEPT, whatever their age.
 *
 * Files are moved to the trash rather than permanently deleted, so a mistake here is
 * recoverable for as long as Drive keeps trashed items rather than being immediately final.
 *
 * A failure in here is logged and swallowed: the backup itself has already been uploaded
 * successfully at this point, and failing the workflow over a housekeeping error would report a
 * successful backup as a failed one.
 */
async function removeExpiredBackups(drive) {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    console.log('\nRetention cleanup disabled (BACKUP_RETENTION_DAYS <= 0).');
    return;
  }

  console.log(`\nRetention: keeping backups for ${RETENTION_DAYS} days.`);

  try {
    const files = [];
    let pageToken;

    do {
      const list = await drive.files.list({
        q: `'${googleDriveFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, createdTime, size)',
        orderBy: 'createdTime desc',
        pageSize: 200,
        // Same reason as the upload: the folder may live on a Shared Drive.
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      files.push(...(list.data.files ?? []));
      pageToken = list.data.nextPageToken;
    } while (pageToken);

    const backups = files.filter((file) => BACKUP_NAME_PATTERN.test(file.name ?? ''));
    console.log(`Found ${backups.length} backup(s) in the folder.`);

    // Newest first (Drive already ordered them, but this does not depend on that holding).
    backups.sort((a, b) => Date.parse(b.createdTime ?? '') - Date.parse(a.createdTime ?? ''));

    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const protectedByFloor = backups.slice(0, MIN_BACKUPS_KEPT);
    const expired = backups
      .slice(MIN_BACKUPS_KEPT)
      .filter((file) => Date.parse(file.createdTime ?? '') < cutoff);

    if (expired.length === 0) {
      console.log(
        `Nothing to remove (${protectedByFloor.length} newest always kept, none of the rest are past the window).`,
      );
      return;
    }

    console.log(`Removing ${expired.length} backup(s) older than ${RETENTION_DAYS} days:`);
    for (const file of expired) {
      // Trash, not delete: `files.delete` is permanent and immediate.
      await drive.files.update({
        fileId: file.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      console.log(`  trashed ${file.name} (created ${file.createdTime})`);
    }

    console.log(`Retention complete. ${backups.length - expired.length} backup(s) remain.`);
  } catch (error) {
    console.error('WARNING: retention cleanup failed. The backup itself uploaded fine.');
    console.error(
      error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message,
    );
  }
}

const fileName = path.basename(backupFile);

console.log(`Uploading backup: ${fileName}`);

try {
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [googleDriveFolderId],
    },
    media: {
      mimeType: 'application/gzip',
      body: fs.createReadStream(backupFile),
    },
    fields: 'id,name,size,createdTime',
    // Required for the target folder to be allowed to live on a Shared Drive. A service
    // account has no My Drive storage quota of its own, so uploading into an ordinary folder
    // that was merely *shared* with it fails with storageQuotaExceeded - the file would be
    // owned by the service account, and it has nowhere to put it. A Shared Drive owns its
    // files at the drive level instead, which is what makes this work. Harmless when the
    // target is not on a Shared Drive.
    supportsAllDrives: true,
  });

  console.log('========================================');
  console.log('Backup uploaded successfully');
  console.log('========================================');
  console.log(`File ID: ${response.data.id}`);
  console.log(`File Name: ${response.data.name}`);
  console.log(`File Size: ${response.data.size} bytes`);
  console.log(`Created: ${response.data.createdTime}`);

  // Retention runs only after a SUCCESSFUL upload, and inside this try block on purpose. If the
  // upload failed we have already exited via the catch below - so a run that could not produce a
  // new backup can never delete an old one. That ordering is the whole safety story: the failure
  // mode to avoid is a broken dump quietly eroding the history that would have saved you.
  await removeExpiredBackups(drive);
} catch (error) {
  console.error('ERROR: Google Drive upload failed.');

  if (error.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error.message);
  }

  // The three failures this setup actually hits, named explicitly - the raw API error for each
  // is accurate but says nothing about what to change.
  const reason = String(error.response?.data?.error?.errors?.[0]?.reason ?? '');
  if (reason === 'storageQuotaExceeded') {
    console.error(
      '\nHINT: service accounts have no My Drive storage quota. GOOGLE_DRIVE_FOLDER_ID must ' +
        'point at a folder on a SHARED DRIVE, with the service account added as a member ' +
        '(Content manager or better) - not an ordinary My Drive folder shared with it.',
    );
  } else if (reason === 'notFound') {
    console.error(
      '\nHINT: the folder id was not found *for this service account*. Confirm ' +
        'GOOGLE_DRIVE_FOLDER_ID is the id from the folder URL, and that the service account ' +
        'has been granted access to it.',
    );
  } else if (reason === 'insufficientFilePermissions') {
    console.error(
      '\nHINT: the service account can see the folder but cannot write to it. Grant it ' +
        'Content manager on the Shared Drive.',
    );
  }

  process.exit(1);
}
