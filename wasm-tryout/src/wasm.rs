use crate::db::Database;
use crate::models::{DisplayFlag, Environment};
use crate::service;
use wasm_bindgen::prelude::*;

/// A JS-accessible store that manages multiple flagd files using the
/// FlagdSchemaAbstraction service.
#[wasm_bindgen]
pub struct FlagdAbstractionStore {
    db: Database,
}

#[wasm_bindgen]
impl FlagdAbstractionStore {
    /// Create a new, empty store
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            db: Database::new(),
        }
    }

    // ── File management ───────────────────────────────────────────────────

    /// List all file names held in this store
    #[wasm_bindgen(js_name = listFiles)]
    pub fn list_files(&self) -> JsValue {
        let names = service::list_files(&self.db);
        serde_wasm_bindgen::to_value(&names).unwrap_or(JsValue::NULL)
    }

    /// Create a new, empty file
    #[wasm_bindgen(js_name = createFile)]
    pub fn create_file(&mut self, name: &str) -> Result<(), JsValue> {
        service::create_file(&mut self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Delete a file
    #[wasm_bindgen(js_name = deleteFile)]
    pub fn delete_file(&mut self, name: &str) -> Result<(), JsValue> {
        service::delete_file(&mut self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // ── Schema import / export ─────────────────────────────────────────────

    /// Import (parse) a flagd JSON schema string into the named file slot.
    /// Equivalent to `FlagdSchemaAbstraction.fromSchema()`.
    #[wasm_bindgen(js_name = importSchema)]
    pub fn import_schema(&mut self, name: &str, schema_json: &str) -> Result<(), JsValue> {
        service::import_schema(&mut self.db, name, schema_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Export the named file's state as a flagd JSON schema string.
    /// Equivalent to `FlagdSchemaAbstraction.exportSchema()`.
    #[wasm_bindgen(js_name = exportSchema)]
    pub fn export_schema(&self, name: &str) -> Result<String, JsValue> {
        service::export_schema(&self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // ── Flag management ───────────────────────────────────────────────────

    /// Get all flags in a file as a JSON array
    #[wasm_bindgen(js_name = getFlags)]
    pub fn get_flags(&self, name: &str) -> Result<JsValue, JsValue> {
        let flags = service::get_flags(&self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_wasm_bindgen::to_value(&flags)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Get a single flag by key; returns null if not found
    #[wasm_bindgen(js_name = getFlag)]
    pub fn get_flag(&self, name: &str, flag_key: &str) -> Result<JsValue, JsValue> {
        let flag = service::get_flag(&self.db, name, flag_key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        match flag {
            Some(f) => serde_wasm_bindgen::to_value(&f)
                .map_err(|e| JsValue::from_str(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }

    /// Create or update a flag from a JSON object
    #[wasm_bindgen(js_name = createOrUpdateFlag)]
    pub fn create_or_update_flag(
        &mut self,
        name: &str,
        flag_json: &str,
        previous_key: Option<String>,
    ) -> Result<(), JsValue> {
        let flag: DisplayFlag = serde_json::from_str(flag_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        service::create_or_update_flag(
            &mut self.db,
            name,
            flag,
            previous_key.as_deref(),
        )
        .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Delete a flag by key
    #[wasm_bindgen(js_name = deleteFlag)]
    pub fn delete_flag(&mut self, name: &str, flag_key: &str) -> Result<(), JsValue> {
        service::delete_flag(&mut self.db, name, flag_key)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // ── Environment management ─────────────────────────────────────────────

    /// Get all environments for a file as a JSON array
    #[wasm_bindgen(js_name = getEnvironments)]
    pub fn get_environments(&self, name: &str) -> Result<JsValue, JsValue> {
        let envs = service::get_environments(&self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_wasm_bindgen::to_value(&envs)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Create or update an environment from a JSON object
    #[wasm_bindgen(js_name = createOrUpdateEnvironment)]
    pub fn create_or_update_environment(
        &mut self,
        name: &str,
        environment_json: &str,
    ) -> Result<(), JsValue> {
        let env: Environment = serde_json::from_str(environment_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        service::create_or_update_environment(&mut self.db, name, env)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Delete an environment by display name
    #[wasm_bindgen(js_name = deleteEnvironment)]
    pub fn delete_environment(&mut self, name: &str, display_name: &str) -> Result<(), JsValue> {
        service::delete_environment(&mut self.db, name, display_name)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // ── Metadata ──────────────────────────────────────────────────────────

    /// Get file-level metadata as a JSON object string; returns null if none
    #[wasm_bindgen(js_name = getMetadata)]
    pub fn get_metadata(&self, name: &str) -> Result<JsValue, JsValue> {
        let meta = service::get_metadata(&self.db, name)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        match meta {
            Some(m) => serde_wasm_bindgen::to_value(&m)
                .map_err(|e| JsValue::from_str(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }

    /// Set file-level metadata from a JSON object string
    #[wasm_bindgen(js_name = setMetadata)]
    pub fn set_metadata(&mut self, name: &str, metadata_json: &str) -> Result<(), JsValue> {
        let meta: std::collections::HashMap<String, serde_json::Value> =
            serde_json::from_str(metadata_json)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
        service::set_metadata(&mut self.db, name, meta)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
