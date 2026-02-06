/**
 * Secrets rotation orchestrator: rotate provider secrets, write to Doppler, verify.
 * Never prints secret values. Use with: doppler run --project tippy --config ci -- npx tsx scripts/rotate_secrets.ts
 * Requires DOPPLER_TOKEN_ROTATOR in Doppler (ci config) for writing secrets back.
 */

const DOPPLER_API = 'https://api.doppler.com/v3/configs/config/secrets';
const PROJECT = process.env.DOPPLER_PROJECT || 'tippy';
const CONFIG = process.env.DOPPLER_CONFIG || 'ci';

function log(line: string): void {
  if (process.stdout.writable) process.stdout.write(line + '\n');
}

async function dopplerUpdateSecrets(secrets: Record<string, string>, token: string): Promise<boolean> {
  const url = `${DOPPLER_API}?project=${encodeURIComponent(PROJECT)}&config=${encodeURIComponent(CONFIG)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ secrets }),
  });
  return res.ok;
}

async function rotateSendGrid(): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const rotatorToken = process.env.DOPPLER_TOKEN_ROTATOR;

  if (!rotatorToken?.trim()) {
    log('SENDGRID_API_KEY: SKIP (no DOPPLER_TOKEN_ROTATOR)');
    return;
  }
  if (!apiKey?.trim()) {
    log('SENDGRID_API_KEY: SKIP (not set)');
    return;
  }

  try {
    const name = `tippy-rotated-${Date.now()}`;
    const createRes = await fetch('https://api.sendgrid.com/v3/api_keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      log(`SENDGRID_API_KEY: FAILED (create ${createRes.status})`);
      throw new Error(`SendGrid create key failed: ${createRes.status}`);
    }

    const data = (await createRes.json()) as { api_key?: string; api_key_id?: string };
    const newKey = data.api_key;
    if (!newKey) {
      log('SENDGRID_API_KEY: FAILED (no key in response)');
      throw new Error('SendGrid response missing api_key');
    }

    const updated = await dopplerUpdateSecrets({ SENDGRID_API_KEY: newKey }, rotatorToken);
    if (!updated) {
      log('SENDGRID_API_KEY: FAILED (Doppler update failed)');
      throw new Error('Doppler update failed');
    }

    const verifyRes = await fetch('https://api.sendgrid.com/v3/user/account', {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    if (!verifyRes.ok) {
      log('SENDGRID_API_KEY: FAILED (verify failed after write)');
      throw new Error('Verification failed');
    }

    log('SENDGRID_API_KEY: ROTATED');
  } catch (e) {
    log(`SENDGRID_API_KEY: FAILED (${e instanceof Error ? e.message : String(e)})`);
    throw e;
  }
}

function rotateTwilio(): void {
  log('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN: MANUAL (no API rotation)');
}

function rotateYoco(): void {
  log('YOCO_*: MANUAL (no API rotation)');
}

async function main(): Promise<void> {
  log('Secrets rotation (names and status only, no values)');
  let failed = false;

  if (process.env.SENDGRID_API_KEY?.trim() && process.env.DOPPLER_TOKEN_ROTATOR?.trim()) {
    try {
      await rotateSendGrid();
    } catch {
      failed = true;
    }
  } else {
    if (process.env.SENDGRID_API_KEY?.trim()) log('SENDGRID_API_KEY: SKIP (no DOPPLER_TOKEN_ROTATOR)');
    else log('SENDGRID_API_KEY: SKIP (not set)');
  }

  rotateTwilio();
  rotateYoco();

  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  log(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
