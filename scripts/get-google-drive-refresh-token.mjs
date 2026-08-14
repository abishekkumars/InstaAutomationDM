// One-time helper: obtains a Google OAuth refresh token for the backup uploader.
//
// Run this ONCE on your own machine. It opens Google's consent screen, catches the redirect on
// a temporary local server, and prints a refresh token to paste into the
// GOOGLE_DRIVE_REFRESH_TOKEN repository secret. Nothing here runs in CI.
//
//   scripts\pnpm.ps1 exec node scripts/get-google-drive-refresh-token.mjs
//
// Why this exists at all: a *service account* has no Drive storage of its own, so it can only
// upload into a Shared Drive - a Google Workspace feature. On a personal Gmail account there are
// no Shared Drives, so the uploader authenticates as a real user instead, and the backups land
// in that user's own My Drive against their own quota.

import http from 'node:http';
import { google } from 'googleapis';

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

// Only the ability to manage files this app itself creates - NOT full Drive access. Two reasons
// that matters: the token cannot touch the rest of your Drive even if it leaks, and `drive.file`
// is a non-sensitive scope, so the OAuth consent screen can be published without Google's
// verification review (see the "Testing mode" note printed at the end - it is important).
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

if (!clientId || !clientSecret) {
  console.error('ERROR: set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first.');
  console.error('');
  console.error('  PowerShell:');
  console.error('    $env:GOOGLE_DRIVE_CLIENT_ID="...apps.googleusercontent.com"');
  console.error('    $env:GOOGLE_DRIVE_CLIENT_SECRET="..."');
  console.error('');
  console.error('  Create them at: Google Cloud Console > APIs & Services > Credentials');
  console.error('  > Create credentials > OAuth client ID > Application type: Desktop app');
  process.exit(1);
}

// Port 0 asks the OS for any free port. Google's "Desktop app" client type permits any loopback
// redirect, so nothing needs registering in advance - which is the whole reason this flow is
// smoother than the deprecated copy-paste one.
const server = http.createServer();
server.listen(0, '127.0.0.1');

await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();
const redirectUri = `http://127.0.0.1:${port}`;

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  // Without offline access Google returns only a short-lived access token and no refresh token,
  // which would leave the workflow unable to authenticate after an hour.
  access_type: 'offline',
  scope: SCOPES,
  // Forces the consent screen even if this client was authorised before. Google issues a refresh
  // token only on first consent, so re-running without this prints "no refresh token" and is the
  // single most confusing way for this script to fail.
  prompt: 'consent',
});

console.log('Open this URL in your browser and approve access:\n');
console.log(authUrl);
console.log('\nWaiting for the redirect...');

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    const url = new URL(req.url, redirectUri);
    const error = url.searchParams.get('error');
    const authCode = url.searchParams.get('code');

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(
      error
        ? `Authorisation failed: ${error}. You can close this tab.`
        : 'Authorised. You can close this tab and return to the terminal.',
    );

    if (error) reject(new Error(error));
    else if (authCode) resolve(authCode);
  });
});

server.close();

const { tokens } = await oauth2.getToken(code);

if (!tokens.refresh_token) {
  console.error('\nERROR: Google returned no refresh token.');
  console.error('This happens when the client was already authorised. Re-run this script - it');
  console.error('passes prompt=consent, which should force a new one - or remove this app at');
  console.error('https://myaccount.google.com/permissions and try again.');
  process.exit(1);
}

console.log('\n========================================');
console.log('GOOGLE_DRIVE_REFRESH_TOKEN');
console.log('========================================');
console.log(tokens.refresh_token);
console.log('========================================');
console.log('\nAdd that as a GitHub repository secret (Settings > Secrets and variables >');
console.log('Actions), alongside GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.');
console.log('');
console.log('IMPORTANT - publish your OAuth consent screen before relying on this:');
console.log('  While the consent screen is in "Testing", Google expires refresh tokens after');
console.log('  SEVEN DAYS. The backup would run fine for a week and then start failing with an');
console.log('  invalid_grant error, which is a bad way to discover your backups stopped.');
console.log('');
console.log('  Google Cloud Console > APIs & Services > OAuth consent screen > PUBLISH APP.');
console.log('  No verification review is required: drive.file is a non-sensitive scope.');
