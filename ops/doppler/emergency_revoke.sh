#!/bin/bash
# Emergency token revocation script
# Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25
#
# WARNING: This script requires explicit human approval and admin token.
# Do not run automatically. Requires DOPPLER_SERVICE_TOKEN_ADMIN to be provided.

set -e

if [ -z "$DOPPLER_SERVICE_TOKEN_ADMIN" ]; then
    echo "ERROR: DOPPLER_SERVICE_TOKEN_ADMIN environment variable is required" >&2
    echo "This script requires explicit human approval and the admin token." >&2
    echo "" >&2
    echo "Usage:" >&2
    echo "  export DOPPLER_SERVICE_TOKEN_ADMIN='dp.st.xxxxx'" >&2
    echo "  ./emergency_revoke.sh <token-id-to-revoke>" >&2
    exit 1
fi

if [ -z "$1" ]; then
    echo "ERROR: Token ID to revoke is required" >&2
    echo "Usage: ./emergency_revoke.sh <token-id>" >&2
    exit 1
fi

TOKEN_ID="$1"
PROJECT_NAME="${2:-tippy}"

echo "⚠️  EMERGENCY TOKEN REVOCATION" >&2
echo "Token ID: $TOKEN_ID" >&2
echo "Project: $PROJECT_NAME" >&2
echo "" >&2
echo "This will permanently revoke the token. Continue? (type 'REVOKE' to confirm)" >&2
read -r confirmation

if [ "$confirmation" != "REVOKE" ]; then
    echo "Revocation cancelled." >&2
    exit 0
fi

# Login and revoke
doppler login --token "$DOPPLER_SERVICE_TOKEN_ADMIN"
doppler service-tokens delete "$TOKEN_ID" --project="$PROJECT_NAME" --token="$DOPPLER_SERVICE_TOKEN_ADMIN"

if [ $? -eq 0 ]; then
    echo "✓ Token $TOKEN_ID revoked successfully" >&2
else
    echo "✗ Failed to revoke token" >&2
    exit 1
fi

