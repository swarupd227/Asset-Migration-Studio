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
# "kvap" = a vault using access policies (no Azure role assignments needed to use it).
KV="${KV:-kvap-ams-${SUFFIX}}"
PG="${PG:-psql-ams-${SUFFIX}}"

echo "Subscription: $(az account show --query name -o tsv)"
echo "Deploying $APP to $RG in $LOCATION (registry $ACR, key vault $KV, image tag $TAG)"

# ---- Resource providers (one-off per subscription) ----
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.DBforPostgreSQL; do
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

# Pull the image with the managed identity when we may create role assignments; otherwise fall back
# to the registry's admin credentials (kept as a Container Apps secret).
if az role assignment list --assignee "$IDENTITY_PRINCIPAL" --scope "$ACR_ID" --role AcrPull --query "[0].id" -o tsv 2>/dev/null | grep -q . \
   || az role assignment create --assignee-object-id "$IDENTITY_PRINCIPAL" --assignee-principal-type ServicePrincipal --role AcrPull --scope "$ACR_ID" -o none; then
  REGISTRY_ARGS=(--registry-server "${ACR}.azurecr.io" --registry-identity "$IDENTITY_ID")
else
  echo "Could not grant AcrPull (your account may not be allowed to create role assignments). Using registry admin credentials instead."
  az acr update -n "$ACR" --admin-enabled true -o none
  REGISTRY_ARGS=(--registry-server "${ACR}.azurecr.io" --registry-username "$ACR"
    --registry-password "$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)")
fi

# ---- Key Vault holding the Anthropic API key ----
# Uses vault access policies, so Key Vault needs no Azure role assignments.
az keyvault show -n "$KV" -o none 2>/dev/null || az keyvault create -g "$RG" -n "$KV" -l "$LOCATION" --enable-rbac-authorization false -o none
if [ "$(az keyvault show -n "$KV" --query properties.enableRbacAuthorization -o tsv)" = "true" ]; then
  # Changing the permission model needs role-assignment rights, so ask for a different vault instead.
  echo "Key Vault $KV uses Azure RBAC, which needs role assignments. Re-run with another name, e.g. KV=kvap2-ams-${SUFFIX} bash deploy/azure/deploy.sh"
  exit 1
fi
ME="$(az ad signed-in-user show --query id -o tsv)"
az keyvault set-policy -n "$KV" --object-id "$ME" --secret-permissions get list set delete -o none
az keyvault set-policy -n "$KV" --object-id "$IDENTITY_PRINCIPAL" --secret-permissions get -o none

if ! az keyvault secret show --vault-name "$KV" -n anthropic-api-key -o none 2>/dev/null; then
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    read -r -s -p "Anthropic API key (leave empty for the scripted assistant): " ANTHROPIC_API_KEY; echo
  fi
  for i in 1 2 3 4 5 6; do
    if az keyvault secret set --vault-name "$KV" -n anthropic-api-key --value "${ANTHROPIC_API_KEY:-none}" -o none 2>/tmp/kv-error.txt; then break; fi
    if [ "$i" = 6 ]; then echo "Could not write the Key Vault secret:"; cat /tmp/kv-error.txt; exit 1; fi
    echo "Waiting for the Key Vault access policy ($i/6)..."; sleep 10
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

# ---- Azure Database for PostgreSQL (Flexible Server) ----
# The connection string, with a generated password, is kept only in Key Vault.
PG_PASSWORD=""
if ! az postgres flexible-server show -g "$RG" -n "$PG" -o none 2>/dev/null; then
  PG_PASSWORD="$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-28)Aa1"
  echo "Creating PostgreSQL server $PG (takes 5-10 minutes)..."
  az postgres flexible-server create -g "$RG" -n "$PG" -l "$LOCATION" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user amsadmin --admin-password "$PG_PASSWORD" \
    --public-access 0.0.0.0 --yes -o none
elif ! az keyvault secret show --vault-name "$KV" -n database-url -o none 2>/dev/null; then
  # Server exists but its connection string was never stored: set a new admin password.
  PG_PASSWORD="$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-28)Aa1"
  az postgres flexible-server update -g "$RG" -n "$PG" --admin-password "$PG_PASSWORD" -o none
fi
az postgres flexible-server db show -g "$RG" --server-name "$PG" --name ams -o none 2>/dev/null || \
  az postgres flexible-server db create -g "$RG" --server-name "$PG" --name ams -o none
if [ -n "$PG_PASSWORD" ]; then
  az keyvault secret set --vault-name "$KV" -n database-url -o none \
    --value "postgres://amsadmin:${PG_PASSWORD}@${PG}.postgres.database.azure.com:5432/ams?sslmode=require"
fi
DB_SECRET_URI="https://${KV}.vault.azure.net/secrets/database-url"

# ---- The app ----
# State lives in PostgreSQL and live events fan out through LISTEN/NOTIFY, so replicas can scale out.
IMAGE="${ACR}.azurecr.io/asset-migration-studio:${TAG}"
SECRETS=("anthropic-api-key=keyvaultref:${SECRET_URI},identityref:${IDENTITY_ID}" "database-url=keyvaultref:${DB_SECRET_URI},identityref:${IDENTITY_ID}")
ENV_VARS=("ANTHROPIC_API_KEY=secretref:anthropic-api-key" "DATABASE_URL=secretref:database-url" "AMS_MODEL=claude-opus-5-5" "PORT=8080" "NODE_ENV=production")
# Container Apps accepts one change at a time: wait until the app has finished the previous one.
wait_ready() {
  for i in $(seq 1 30); do
    state="$(az containerapp show -g "$RG" -n "$APP" --query properties.provisioningState -o tsv 2>/dev/null)"
    [ "$state" = "Succeeded" ] || [ "$state" = "Failed" ] && return 0
    echo "Waiting for the app to finish its previous update ($state)..."; sleep 10
  done
}
if az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  wait_ready
  az containerapp secret set -g "$RG" -n "$APP" --secrets "${SECRETS[@]}" -o none
  for attempt in 1 2 3 4 5; do
    wait_ready
    if az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" --set-env-vars "${ENV_VARS[@]}" --min-replicas 1 --max-replicas 3 -o none; then break; fi
    [ "$attempt" = 5 ] && exit 1
    echo "Update did not go through; retrying ($attempt/5)..."; sleep 15
  done
else
  echo "Waiting 60s for the identity's permissions to apply..."; sleep 60
  az containerapp create -g "$RG" -n "$APP" --environment "$ENV_NAME" \
    --image "$IMAGE" "${REGISTRY_ARGS[@]}" \
    --user-assigned "$IDENTITY_ID" \
    --secrets "${SECRETS[@]}" --env-vars "${ENV_VARS[@]}" \
    --ingress external --target-port 8080 \
    --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 3 -o none
fi

FQDN="$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)"
echo
echo "Deployed: https://${FQDN}"
echo "Health:   https://${FQDN}/api/health"
echo "Next: run deploy/azure/enable-signin.sh so only your organisation can open it."
