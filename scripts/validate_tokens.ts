/**
 * Token healthcheck: validate tokens/secrets without printing any secret values.
 * Ledger: §19.5, §25.x. Use with: doppler run -- npx tsx scripts/validate_tokens.ts
 * Output: <ENV_NAME>: <STATUS> (<HTTP_CODE>) when applicable, else <ENV_NAME>: <STATUS>
 * Exit: 0 if all valid/skip/unknown, 1 if any invalid.
 */

const results: { name: string; status: 'VALID' | 'INVALID' | 'SKIP' | 'UNKNOWN'; code?: number }[] = [];

function out(name: string, status: 'VALID' | 'INVALID' | 'SKIP' | 'UNKNOWN', code?: number): void {
  results.push({ name, status, code });
  const line = code != null ? `${name}: ${status} (${code})` : `${name}: ${status}`;
  if (process.stdout.writable) process.stdout.write(line + '\n');
}

async function checkGitHub(): Promise<void> {
  const ghToken = process.env.GITHUB_TOKEN;
  const patToken = process.env.GH_TOKEN;

  if (ghToken?.trim()) {
    try {
      const res = await fetch('https://api.github.com/rate_limit', {
        headers: { Authorization: `token ${ghToken}` },
      });
      if (res.ok) out('GITHUB_TOKEN', 'VALID', 200);
      else out('GITHUB_TOKEN', 'INVALID', res.status);
    } catch {
      out('GITHUB_TOKEN', 'INVALID', 0);
    }
  } else {
    out('GITHUB_TOKEN', 'SKIP');
  }

  if (patToken?.trim()) {
    try {
      const res = await fetch('https://api.github.com/rate_limit', {
        headers: { Authorization: `token ${patToken}` },
      });
      if (res.ok) out('GH_TOKEN', 'VALID', 200);
      else out('GH_TOKEN', 'INVALID', res.status);
    } catch {
      out('GH_TOKEN', 'INVALID', 0);
    }
  } else {
    out('GH_TOKEN', 'SKIP');
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
    if (res.ok) out('SENDGRID_API_KEY', 'VALID', 200);
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
    if (res.ok) out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'VALID', 200);
    else out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'INVALID', res.status);
  } catch {
    out('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN', 'INVALID', 0);
  }
}

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

  const invalid = results.filter((r) => r.status === 'INVALID');
  if (invalid.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(() => process.exit(1));
