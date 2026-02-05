/**
 * Token healthcheck: validate tokens/secrets without printing any secret values.
 * Ledger: §19.5, §25.x. Use with: doppler run -- npx tsx scripts/validate_tokens.ts
 * Output: TOKEN_NAME STATUS [HTTP_CODE]
 * Exit: 0 if all valid/skip, 1 if any invalid.
 */

const results: { name: string; status: 'VALID' | 'INVALID' | 'SKIP' | 'UNKNOWN'; code?: number }[] = [];

function out(name: string, status: 'VALID' | 'INVALID' | 'SKIP' | 'UNKNOWN', code?: number): void {
  results.push({ name, status, code });
  const line = code != null ? `${name} ${status} ${code}` : `${name} ${status}`;
  if (process.stdout.writable) process.stdout.write(line + '\n');
}

async function checkGitHub(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const name = process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'GH_TOKEN';
  if (!token || token.trim() === '') {
    out(name, 'SKIP');
    return;
  }
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: { Authorization: `token ${token}` },
    });
    if (res.ok) out(name, 'VALID');
    else out(name, 'INVALID', res.status);
  } catch {
    out(name, 'INVALID', 0);
  }
}

async function checkSendGrid(): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    out('SENDGRID_API_KEY', 'SKIP');
    return;
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/user/account', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) out('SENDGRID_API_KEY', 'VALID');
    else out('SENDGRID_API_KEY', 'INVALID', res.status);
  } catch {
    out('SENDGRID_API_KEY', 'INVALID', 0);
  }
}

async function checkTwilio(): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.trim() === '' || token.trim() === '') {
    out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'SKIP');
    return;
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'VALID');
    else out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'INVALID', res.status);
  } catch {
    out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'INVALID', 0);
  }
}

/**
 * Yoco: no documented read-only validation endpoint; we do not call charges or other mutating APIs.
 * Mark as UNKNOWN so healthcheck does not fail for missing/invalid Yoco keys; report documents manual checks.
 */
function checkYoco(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const pub = isProd ? process.env.YOCO_LIVE_PUBLIC_KEY : process.env.YOCO_TEST_PUBLIC_KEY;
  const sec = isProd ? process.env.YOCO_LIVE_SECRET_KEY : process.env.YOCO_TEST_SECRET_KEY;
  const name = isProd ? 'YOCO_LIVE_*' : 'YOCO_TEST_*';
  if (!pub?.trim() && !sec?.trim()) {
    out(name, 'SKIP');
    return;
  }
  out(name, 'UNKNOWN');
}

async function main(): Promise<void> {
  await checkGitHub();
  await checkSendGrid();
  await checkTwilio();
  checkYoco();

// Always print a clean summary (no secret values)
for (const r of results) {
  const suffix = r.code ? ` (${r.code})` : '';
  console.log(`${r.name}: ${r.status}${suffix}`);
}

const invalid = results.filter((r) => r.status === 'INVALID');
process.exit(invalid.length > 0 ? 1 : 0);

}

main().catch(() => process.exit(1));
