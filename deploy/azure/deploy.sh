#!/usr/bin/env bash
# Deploy Asset Migration Studio to Azure Container Apps. Run from Azure Cloud Shell (bash),
# inside a clone of https://github.com/swarupd227/Asset-Migration-Studio.
# Safe to re-run: existing resources are reused and the app is updated to the new image.
set -euo pipefail

az account set --subscription "Microsoft Azure Sponsorship"

# ---- Settings (change if you like) ----
LOCATION="${LOCATION:-uksouth}"
RG="${RG:-rg-asset-migration-studio}"
APP="${APP:-asset-migration-studio}"
ENV_NAME="${ENV_NAME:-cae-asset-migration-studio}"
IDENTITY="${IDENTITY:-id-asset-migration-studio}"
LOGS="${LOGS:-log-asset-migration-studio}"
TAG="${TAG:-v$(date +%Y%m%d%H%M)}"
# Registry and Key Vault names must be globally unique: derive a short suffix from the subscription.
SUFFIX="$(az account show --query id -o tsv | tr -d '-' | cut -c1-8)"
ACR="${ACR:-acrams${SUFFIX}}"
KV="${KV:-kv-ams-${SUFFIX}}"

echo "Subscription: $(az account show --query name -o tsv)"
echo "Deploying $APP to $RG in $LOCATION (registry $ACR, key vault $KV, image tag $TAG)"

# ---- Resource providers (one-off per subscription) ----
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.ManagedIdentity; do
  az provider register --namespace "$ns" --wait >/dev/null
done

# ---- Resource group ----
az group create --name "$RG" --location "$LOCATION" -o none

# ---- Container registry, and build the image in Azure (no Docker needed in Cloud Shell) ----
az acr show --name "$ACR" -o none 2>/dev/null || az acr create --resource-group "$RG" --name "$ACR" --sku Basic --admin-enabled false -o none
az acr build --registry "$ACR" --image "asset-migration-studio:$TAG" --file Dockerfile .

# ---- Managed identity: pulls the image and reads the Key Vault secret ----
az identity show -g "$RG" -n "$IDENTITY" -o none 2>/dev/null || az identity create -g "$RG" -n "$IDENTITY" -o none
IDENTITY_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query id -o tsv)"
IDENTITY_PRINCIPAL="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"
ACR_ID="$(az acr show -n "$ACR" --query id -o tsv)"
az role assignment create --assignee-object-id "$IDENTITY_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" -o none 2>/dev/null || true

# ---- Key Vault holding the Anthropic API key ----
az keyvault show -n "$KV" -o none 2>/dev/null || az keyvault create -g "$RG" -n "$KV" -l "$LOCATION" --enable-rbac-authorization true -o none
KV_ID="$(az keyvault show -n "$KV" --query id -o tsv)"
ME="$(az ad signed-in-user show --query id -o tsv)"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Key Vault Secrets Officer" --scope "$KV_ID" -o none 2>/dev/null || true
az role assignment create --assignee-object-id "$IDENTITY_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$KV_ID" -o none 2>/dev/null || true

if ! az keyvault secret show --vault-name "$KV" -n anthropic-api-key -o none 2>/dev/null; then
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    read -r -s -p "Anthropic API key (leave empty for the scripted assistant): " ANTHROPIC_API_KEY; echo
  fi
  # Role assignments take a minute to apply, so retry the first write.
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if az keyvault secret set --vault-name "$KV" -n anthropic-api-key --value "${ANTHROPIC_API_KEY:-none}" -o none 2>/dev/null; then break; fi
    echo "Waiting for Key Vault permissions ($i/10)…"; sleep 15
  done
fi
SECRET_URI="https://${KV}.vault.azure.net/secrets/anthropic-api-key"

# ---- Container Apps environment with Log Analytics ----
az monitor log-analytics workspace show -g "$RG" -n "$LOGS" -o none 2>/dev/null || \
  az monitor log-analytics workspace create -g "$RG" -n "$LOGS" -l "$LOCATION" -o none
LOGS_ID="$(az monitor log-analytics workspace show -g "$RG" -n "$LOGS" --query customerId -o tsv)"
LOGS_KEY="$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n "$LOGS" --query primarySharedKey -o tsv)"
az containerapp env show -g "$RG" -n "$ENV_NAME" -o none 2>/dev/null || \
  az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" --logs-workspace-id "$LOGS_ID" --logs-workspace-key "$LOGS_KEY" -o none

# ---- The app ----
# One replica, always on: the concept demo keeps its state in memory.
IMAGE="${ACR}.azurecr.io/asset-migration-studio:${TAG}"
if az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" -o none
else
  echo "Waiting 60s for the identity's registry and Key Vault roles to apply…"; sleep 60
  az containerapp create -g "$RG" -n "$APP" --environment "$ENV_NAME" \
    --image "$IMAGE" --registry-server "${ACR}.azurecr.io" --registry-identity "$IDENTITY_ID" \
    --user-assigned "$IDENTITY_ID" \
    --secrets "anthropic-api-key=keyvaultref:${SECRET_URI},identityref:${IDENTITY_ID}" \
    --env-vars "ANTHROPIC_API_KEY=secretref:anthropic-api-key" "AMS_MODEL=claude-opus-5-5" "PORT=8080" \
    --ingress external --target-port 8080 \
    --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1 -o none
fi

FQDN="$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)"
echo
echo "Deployed: https://${FQDN}"
echo "Health:   https://${FQDN}/api/health"
echo "Next: run deploy/azure/enable-signin.sh so only your organisation can open it."
