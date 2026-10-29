#!/usr/bin/env bash
# Require Microsoft Entra ID sign-in (your tenant only) in front of the app.
# Run from Azure Cloud Shell after deploy.sh. Needs permission to create app registrations.
set -euo pipefail

az account set --subscription "Microsoft Azure Sponsorship"

RG="${RG:-rg-asset-migration-studio}"
APP="${APP:-asset-migration-studio}"

FQDN="$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)"
TENANT="$(az account show --query tenantId -o tsv)"

CLIENT_ID="$(az ad app list --display-name "Asset Migration Studio" --query "[0].appId" -o tsv)"
if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(az ad app create --display-name "Asset Migration Studio" --sign-in-audience AzureADMyOrg \
    --web-redirect-uris "https://${FQDN}/.auth/login/aad/callback" --enable-id-token-issuance true --query appId -o tsv)"
  az ad sp create --id "$CLIENT_ID" -o none
fi
CLIENT_SECRET="$(az ad app credential reset --id "$CLIENT_ID" --display-name container-app --years 1 --query password -o tsv)"

az containerapp auth microsoft update -g "$RG" -n "$APP" \
  --client-id "$CLIENT_ID" --client-secret "$CLIENT_SECRET" \
  --issuer "https://login.microsoftonline.com/${TENANT}/v2.0" --yes -o none
az containerapp auth update -g "$RG" -n "$APP" --enabled true --unauthenticated-client-action RedirectToLoginPage -o none

echo "Sign-in is on. Open https://${FQDN} and sign in with your organisation account."
