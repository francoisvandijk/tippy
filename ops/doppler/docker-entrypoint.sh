#!/bin/bash
# Doppler-enabled Docker entrypoint for Tippy
# Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

set -e

# Validate required environment variables
if [ -z "$DOPPLER_TOKEN" ]; then
    echo "ERROR: DOPPLER_TOKEN environment variable is required" >&2
    exit 1
fi

if [ -z "$DOPPLER_ENVIRONMENT" ]; then
    echo "WARNING: DOPPLER_ENVIRONMENT not set, defaulting to 'development'" >&2
    export DOPPLER_ENVIRONMENT="development"
fi

# Login to Doppler (done at deploy time, not runtime)
echo "Authenticating with Doppler..."
doppler login --token "$DOPPLER_TOKEN" > /dev/null 2>&1

# Configure Doppler project and environment
doppler configure --project tippy --config "$DOPPLER_ENVIRONMENT" > /dev/null 2>&1

# Verify access
if ! doppler secrets download --no-file > /dev/null 2>&1; then
    echo "ERROR: Failed to access Doppler secrets" >&2
    exit 1
fi

echo "✓ Doppler configured for environment: $DOPPLER_ENVIRONMENT"

# Execute the command with Doppler-injected environment variables
exec doppler run -- "$@"

