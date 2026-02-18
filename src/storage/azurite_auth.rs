use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use azure_core::credentials::{AccessToken, Secret, TokenCredential, TokenRequestOptions};
use std::sync::Arc;

/// A static token credential for Azurite local development.
///
/// generates a JWT signed with the Azurite server key and returns it
/// as a static bearer token. Azurite accepts OAuth tokens without
/// validating the signature (see <https://github.com/Azure/azure-sdk-for-rust/issues/2975>).
#[derive(Clone)]
struct AzuriteTokenCredential {
    token: String,
}

impl std::fmt::Debug for AzuriteTokenCredential {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AzuriteTokenCredential")
    }
}

#[async_trait]
impl TokenCredential for AzuriteTokenCredential {
    async fn get_token(
        &self,
        _scopes: &[&str],
        _options: Option<TokenRequestOptions<'_>>,
    ) -> azure_core::Result<AccessToken> {
        let expires_on = azure_core::time::OffsetDateTime::from_unix_timestamp(9_999_999_999)
            .expect("valid timestamp");
        Ok(AccessToken {
            token: Secret::new(self.token.clone()),
            expires_on,
        })
    }
}

/// Generate a JWT token for Azurite authentication.
///
/// - Reads the RSA private key from `AZURITE_KEY_PATH` env var
///   (defaults to `services/azurite/certs/server-key.pem`)
/// - Signs a JWT with RS256 containing Azure-compatible claims
fn generate_azurite_token() -> AppResult<String> {
    let key_path = std::env::var("AZURITE_KEY_PATH")
        .unwrap_or_else(|_| "services/azurite/certs/server-key.pem".to_string());

    let private_key_pem = std::fs::read_to_string(&key_path).map_err(|e| {
        AppError::BadRequest(format!(
            "Failed to read Azurite private key from '{}': {}. \
             Generate certs with: ./services/azurite/generate-certs.sh",
            key_path, e
        ))
    })?;

    let encoding_key = jsonwebtoken::EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
        .map_err(|e| AppError::BadRequest(format!("Failed to parse RSA private key: {}", e)))?;

    let claims = serde_json::json!({
        "aud": "https://storage.azure.com",
        "iss": "https://sts.windows.net/",
        "iat": 0,
        "nbf": 0,
        "exp": 9_999_999_999_u64,
        "acr": "1",
        "aio": "",
        "altsecid": "1:live.com:foo",
        "amr": ["pwd"],
        "appid": "foo",
        "appidacr": "0",
        "email": "foo@foo.com",
        "family_name": "foo",
        "given_name": "foo",
        "groups": ["foo"],
        "idp": "live.com",
        "idtyp": "user",
        "ipaddr": "127.0.0.1",
        "name": "foo",
        "oid": "23657296-5cd5-45b0-a809-d972a7f4dfe1",
        "puid": "",
        "rh": "foo",
        "scp": "user_impersonation",
        "sub": "",
        "tid": "dd0d0df1-06c3-436c-8034-4b9a153097ce",
        "unique_name": "live.com#foo@foo.com",
        "uti": "",
        "ver": "1.0",
        "xms_idrel": "16 5"
    });

    let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    header.typ = Some("JWT".to_string());
    header.kid = Some("foo".to_string());

    let token = jsonwebtoken::encode(&header, &claims, &encoding_key)
        .map_err(|e| AppError::BadRequest(format!("Failed to encode JWT for Azurite: {}", e)))?;

    tracing::info!("Generated Azurite OAuth token for local development");
    Ok(token)
}

pub fn build_azurite_token_credential() -> AppResult<Arc<dyn TokenCredential>> {
    let token = generate_azurite_token()?;
    Ok(Arc::new(AzuriteTokenCredential { token }))
}
