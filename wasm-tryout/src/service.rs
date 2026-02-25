use crate::db::{Database, FileState};
use crate::models::{
    DisplayFlag, Environment, FlagState, FlagType, FlagdSchema, RawFlagDefinition, TimeWindow,
    TimeWindowValue, ValueDefinition,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use thiserror::Error;

const ENV_EVALUATOR_PREFIX: &str = "is";
const ENV_VAR_NAME: &str = "environment";
const JSONLOGIC_IN: &str = "in";
const JSONLOGIC_VAR: &str = "var";
const JSONLOGIC_AND: &str = "and";
const TIMESTAMP_VAR: &str = "$flagd.timestamp";
const BOOLEAN_ON_VARIANT: &str = "on";
const DEFAULT_VARIANT: &str = "default";
const FLAGD_SCHEMA_URL: &str = "https://flagd.dev/schema/v0/flags.json";

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("File '{0}' not found")]
    FileNotFound(String),
    #[error("Flag '{0}' not found in file '{1}'")]
    FlagNotFound(String, String),
    #[error("File '{0}' already exists")]
    FileAlreadyExists(String),
    #[error("Invalid schema: {0}")]
    InvalidSchema(String),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

pub type ServiceResult<T> = Result<T, ServiceError>;

// ─── File management ─────────────────────────────────────────────────────────

/// List all file names in the database
pub fn list_files(db: &Database) -> Vec<String> {
    let mut names: Vec<String> = db.files.keys().cloned().collect();
    names.sort();
    names
}

/// Create a new, empty file entry
pub fn create_file(db: &mut Database, name: &str) -> ServiceResult<()> {
    if db.files.contains_key(name) {
        return Err(ServiceError::FileAlreadyExists(name.to_string()));
    }
    db.files.insert(name.to_string(), FileState::default());
    Ok(())
}

/// Delete a file entry
pub fn delete_file(db: &mut Database, name: &str) -> ServiceResult<()> {
    if db.files.remove(name).is_none() {
        return Err(ServiceError::FileNotFound(name.to_string()));
    }
    Ok(())
}

// ─── Schema import / export ───────────────────────────────────────────────────

/// Import a flagd JSON schema string into the database under the given file name.
/// Equivalent to `FlagdSchemaAbstraction.fromSchema()`.
pub fn import_schema(db: &mut Database, name: &str, schema_json: &str) -> ServiceResult<()> {
    let schema: FlagdSchema = serde_json::from_str(schema_json)
        .map_err(|e| ServiceError::InvalidSchema(e.to_string()))?;

    let mut state = FileState::default();

    // Copy file-level metadata
    if let Some(meta) = schema.metadata {
        state.metadata = Some(meta);
    }

    // Extract environments from $evaluators
    if let Some(evaluators) = &schema.evaluators {
        for (key, evaluator) in evaluators {
            if let Some(env_name) = parse_environment_evaluator(key, evaluator) {
                state
                    .environment_aliases
                    .insert(env_name.to_lowercase(), extract_aliases(evaluator));
            }
        }
    }

    // Parse each flag
    for (flag_key, raw_flag) in &schema.flags {
        let flag_type = infer_flag_type(&raw_flag.variants);
        let value = raw_flag
            .default_variant
            .as_deref()
            .and_then(|dv| raw_flag.variants.get(dv))
            .cloned();

        let mut display_flag = DisplayFlag {
            key: flag_key.clone(),
            flag_type: flag_type.clone(),
            state: parse_flag_state(&raw_flag.state),
            value,
            metadata: raw_flag.metadata.clone(),
            per_environment_definitions: None,
            global_time_window: None,
        };

        // Parse targeting for time windows and per-environment definitions
        if let Some(targeting) = &raw_flag.targeting {
            let parsed = parse_environment_timing_targeting(targeting);

            // Handle global time window
            if let Some(global) = parsed.global {
                if let Some(tw) = global.time_window {
                    display_flag.global_time_window = Some(TimeWindowValue {
                        value: Value::Null,
                        time_window: tw,
                    });
                }
            }

            // Handle per-environment definitions
            if !parsed.per_environment.is_empty() {
                let environments = get_environments_from_state(&state);
                let mut per_env_defs: HashMap<String, ValueDefinition> = HashMap::new();

                for (env_name, env_data) in &parsed.per_environment {
                    let matched_env = environments.iter().find(|e| {
                        e.display_name.to_lowercase() == env_name.to_lowercase()
                    });

                    if let Some(env) = matched_env {
                        let env_value = env_data
                            .variant
                            .as_deref()
                            .and_then(|v| raw_flag.variants.get(v))
                            .cloned()
                            .unwrap_or(default_value_for_type(&flag_type));

                        per_env_defs.insert(
                            env.display_name.clone(),
                            ValueDefinition {
                                value: env_value,
                                time_window: build_time_window(env_data.start, env_data.end),
                            },
                        );
                    }
                }

                if !per_env_defs.is_empty() {
                    display_flag.per_environment_definitions = Some(per_env_defs);
                }
            }
        }

        state.flags_map.insert(flag_key.clone(), display_flag);
    }

    db.files.insert(name.to_string(), state);
    Ok(())
}

/// Export the internal state of a file as a flagd JSON schema string.
/// Equivalent to `FlagdSchemaAbstraction.exportSchema()`.
pub fn export_schema(db: &Database, name: &str) -> ServiceResult<String> {
    let state = db
        .files
        .get(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;

    // Build $evaluators from environment aliases
    let mut evaluators: HashMap<String, Value> = HashMap::new();
    for (env_name, aliases) in &state.environment_aliases {
        let ref_key = format!(
            "{}{}{}",
            ENV_EVALUATOR_PREFIX,
            env_name[..1].to_uppercase(),
            &env_name[1..]
        );
        evaluators.insert(
            ref_key,
            json!({
                JSONLOGIC_IN: [
                    { JSONLOGIC_VAR: ENV_VAR_NAME },
                    aliases
                ]
            }),
        );
    }

    // Build flags
    let mut flags: HashMap<String, RawFlagDefinition> = HashMap::new();
    for display_flag in state.flags_map.values() {
        let variant_key = if display_flag.flag_type == FlagType::Boolean {
            BOOLEAN_ON_VARIANT.to_string()
        } else {
            DEFAULT_VARIANT.to_string()
        };

        let mut variants: HashMap<String, Value> = HashMap::new();
        if let Some(val) = &display_flag.value {
            variants.insert(variant_key.clone(), val.clone());
        }

        let targeting = build_targeting_from_time_windows(
            display_flag.per_environment_definitions.as_ref(),
            display_flag.global_time_window.as_ref(),
        );

        let flag_def = RawFlagDefinition {
            state: match display_flag.state {
                FlagState::Enabled => "ENABLED".to_string(),
                FlagState::Disabled => "DISABLED".to_string(),
            },
            variants,
            default_variant: Some(variant_key),
            targeting,
            metadata: display_flag.metadata.clone(),
        };

        flags.insert(display_flag.key.clone(), flag_def);
    }

    let schema = FlagdSchema {
        schema: Some(FLAGD_SCHEMA_URL.to_string()),
        flags,
        evaluators: if evaluators.is_empty() {
            None
        } else {
            Some(evaluators)
        },
        metadata: state.metadata.clone(),
    };

    serde_json::to_string_pretty(&schema).map_err(ServiceError::JsonError)
}

// ─── Flag management ──────────────────────────────────────────────────────────

/// Get all flags in a file
pub fn get_flags(db: &Database, name: &str) -> ServiceResult<Vec<DisplayFlag>> {
    let state = db
        .files
        .get(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    let mut flags: Vec<DisplayFlag> = state.flags_map.values().cloned().collect();
    flags.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(flags)
}

/// Get a single flag by key
pub fn get_flag(db: &Database, name: &str, flag_key: &str) -> ServiceResult<Option<DisplayFlag>> {
    let state = db
        .files
        .get(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    Ok(state.flags_map.get(flag_key).cloned())
}

/// Create or update a flag. Pass `previous_key` when renaming.
pub fn create_or_update_flag(
    db: &mut Database,
    name: &str,
    flag: DisplayFlag,
    previous_key: Option<&str>,
) -> ServiceResult<()> {
    let state = db
        .files
        .get_mut(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;

    if let Some(prev) = previous_key {
        if prev != flag.key {
            state.flags_map.remove(prev);
        }
    }
    state.flags_map.insert(flag.key.clone(), flag);
    Ok(())
}

/// Delete a flag by key
pub fn delete_flag(db: &mut Database, name: &str, flag_key: &str) -> ServiceResult<()> {
    let state = db
        .files
        .get_mut(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    if state.flags_map.remove(flag_key).is_none() {
        return Err(ServiceError::FlagNotFound(
            flag_key.to_string(),
            name.to_string(),
        ));
    }
    Ok(())
}

// ─── Environment management ───────────────────────────────────────────────────

/// Get all environments for a file
pub fn get_environments(db: &Database, name: &str) -> ServiceResult<Vec<Environment>> {
    let state = db
        .files
        .get(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    Ok(get_environments_from_state(state))
}

/// Create or update an environment
pub fn create_or_update_environment(
    db: &mut Database,
    name: &str,
    environment: Environment,
) -> ServiceResult<()> {
    let state = db
        .files
        .get_mut(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    state
        .environment_aliases
        .insert(environment.display_name.to_lowercase(), environment.aliases);
    Ok(())
}

/// Delete an environment by display name
pub fn delete_environment(
    db: &mut Database,
    name: &str,
    display_name: &str,
) -> ServiceResult<()> {
    let state = db
        .files
        .get_mut(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    state
        .environment_aliases
        .remove(&display_name.to_lowercase());
    Ok(())
}

// ─── File metadata ────────────────────────────────────────────────────────────

/// Get file-level metadata
pub fn get_metadata(
    db: &Database,
    name: &str,
) -> ServiceResult<Option<HashMap<String, Value>>> {
    let state = db
        .files
        .get(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    Ok(state.metadata.clone())
}

/// Set file-level metadata
pub fn set_metadata(
    db: &mut Database,
    name: &str,
    metadata: HashMap<String, Value>,
) -> ServiceResult<()> {
    let state = db
        .files
        .get_mut(name)
        .ok_or_else(|| ServiceError::FileNotFound(name.to_string()))?;
    state.metadata = Some(metadata);
    Ok(())
}

// ─── Private helpers ──────────────────────────────────────────────────────────

fn get_environments_from_state(state: &FileState) -> Vec<Environment> {
    let mut envs: Vec<Environment> = state
        .environment_aliases
        .iter()
        .map(|(name, aliases)| {
            let display_name = capitalize(name);
            Environment {
                display_name,
                aliases: aliases.clone(),
            }
        })
        .collect();
    envs.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    envs
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Check whether an evaluator key+value is an environment evaluator and return the env name
fn parse_environment_evaluator<'a>(key: &'a str, evaluator: &Value) -> Option<&'a str> {
    if !key.starts_with(ENV_EVALUATOR_PREFIX) {
        return None;
    }
    let in_op = evaluator.get(JSONLOGIC_IN)?;
    let arr = in_op.as_array()?;
    if arr.len() != 2 {
        return None;
    }
    let var_check = arr[0].get(JSONLOGIC_VAR)?.as_str()?;
    if var_check != ENV_VAR_NAME {
        return None;
    }
    arr[1].as_array()?; // ensure second element is an array
    Some(&key[ENV_EVALUATOR_PREFIX.len()..])
}

fn extract_aliases(evaluator: &Value) -> Vec<String> {
    evaluator
        .get(JSONLOGIC_IN)
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.get(1))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn infer_flag_type(variants: &HashMap<String, Value>) -> FlagType {
    match variants.values().next() {
        Some(Value::Bool(_)) => FlagType::Boolean,
        Some(Value::Number(_)) => FlagType::Number,
        Some(Value::String(_)) => FlagType::String,
        _ => FlagType::Object,
    }
}

fn parse_flag_state(s: &str) -> FlagState {
    if s == "DISABLED" {
        FlagState::Disabled
    } else {
        FlagState::Enabled
    }
}

fn default_value_for_type(t: &FlagType) -> Value {
    match t {
        FlagType::Boolean => Value::Bool(true),
        FlagType::String => Value::String(String::new()),
        FlagType::Number => Value::Number(0.into()),
        FlagType::Object => Value::Object(Default::default()),
    }
}

fn build_time_window(start: Option<i64>, end: Option<i64>) -> Option<TimeWindow> {
    if start.is_none() && end.is_none() {
        return None;
    }
    Some(TimeWindow {
        start_time: start,
        end_time: end,
    })
}

// ─── Targeting parsing (fromSchema) ──────────────────────────────────────────

struct PerEnvData {
    start: Option<i64>,
    end: Option<i64>,
    variant: Option<String>,
}

struct ParsedTargeting {
    global: Option<ParsedGlobal>,
    per_environment: HashMap<String, PerEnvData>,
}

struct ParsedGlobal {
    time_window: Option<TimeWindow>,
}

fn parse_environment_timing_targeting(targeting: &Value) -> ParsedTargeting {
    let mut result = ParsedTargeting {
        global: None,
        per_environment: HashMap::new(),
    };

    let mut cursor = targeting;
    let temp;

    if let Some(if_clause) = as_if_clause(cursor) {
        let global_tw = extract_timestamp_bounds(&if_clause[0]);
        let env_cond = extract_environment_condition(&if_clause[0]);

        if global_tw.is_some() && env_cond.is_none() {
            result.global = Some(ParsedGlobal {
                time_window: global_tw.map(|(start, end)| TimeWindow {
                    start_time: start,
                    end_time: end,
                }),
            });
            temp = if_clause[2].clone();
            cursor = &temp;
        }
    }

    parse_environment_chain(cursor, &mut result.per_environment);
    result
}

fn parse_environment_chain(node: &Value, per_env: &mut HashMap<String, PerEnvData>) {
    let Some(if_clause) = as_if_clause(node) else {
        return;
    };

    if let Some(env_name) = extract_environment_condition(&if_clause[0]) {
        let (start, end) = extract_timestamp_bounds(&if_clause[0]).unwrap_or((None, None));
        let variant = if_clause[1].as_str().map(String::from);
        per_env.insert(
            env_name,
            PerEnvData {
                start,
                end,
                variant,
            },
        );
    }

    parse_environment_chain(&if_clause[2], per_env);
}

/// Extract the environment name from a JsonLogic condition node
fn extract_environment_condition(condition: &Value) -> Option<String> {
    if !condition.is_object() {
        return None;
    }

    // Check for $ref to an evaluator (e.g. {"$ref": "isProduction"})
    if let Some(ref_val) = condition.get("$ref").and_then(|v| v.as_str()) {
        if let Some(stripped) = ref_val.strip_prefix(ENV_EVALUATOR_PREFIX) {
            return Some(stripped.to_lowercase());
        }
    }

    // Check for direct 'in' operator: {"in": [{"var": "environment"}, ["prod"]]}
    if let Some(in_op) = condition.get(JSONLOGIC_IN) {
        if let Some(arr) = in_op.as_array() {
            if arr.len() == 2 {
                let var_part = &arr[0];
                let values_part = &arr[1];
                if var_part.get(JSONLOGIC_VAR).and_then(|v| v.as_str()) == Some(ENV_VAR_NAME) {
                    if let Some(vals) = values_part.as_array() {
                        if let Some(first) = vals.first().and_then(|v| v.as_str()) {
                            return Some(first.to_lowercase());
                        }
                    }
                }
            }
        }
    }

    // Check for 'and' combining environment and time conditions
    if let Some(parts) = condition.get(JSONLOGIC_AND).and_then(|v| v.as_array()) {
        for part in parts {
            if let Some(env) = extract_environment_condition(part) {
                return Some(env);
            }
        }
    }

    None
}

/// Extract Unix timestamp bounds from a JsonLogic condition node
fn extract_timestamp_bounds(value: &Value) -> Option<(Option<i64>, Option<i64>)> {
    if !value.is_object() {
        return None;
    }

    if let Some(parts) = value.get(">=").and_then(|v| v.as_array()) {
        if let Some(ts) = read_timestamp_comparison(parts) {
            return Some((Some(ts), None));
        }
    }

    if let Some(parts) = value.get("<=").and_then(|v| v.as_array()) {
        if let Some(ts) = read_timestamp_comparison(parts) {
            return Some((None, Some(ts)));
        }
    }

    if let Some(sub_conditions) = value.get(JSONLOGIC_AND).and_then(|v| v.as_array()) {
        let mut start: Option<i64> = None;
        let mut end: Option<i64> = None;
        let mut found = false;

        for sub in sub_conditions {
            if let Some((s, e)) = extract_timestamp_bounds(sub) {
                found = true;
                if s.is_some() {
                    start = s;
                }
                if e.is_some() {
                    end = e;
                }
            }
        }

        if found {
            return Some((start, end));
        }
    }

    None
}

fn read_timestamp_comparison(parts: &[Value]) -> Option<i64> {
    if parts.len() < 2 {
        return None;
    }

    let var_part = &parts[0];
    let time_part = &parts[1];

    // Normal order: [{"var": "$flagd.timestamp"}, <number>]
    if var_part
        .get(JSONLOGIC_VAR)
        .and_then(|v| v.as_str())
        == Some(TIMESTAMP_VAR)
    {
        if let Some(n) = time_part.as_i64() {
            return Some(n);
        }
    }

    // Reversed order: [<number>, {"var": "$flagd.timestamp"}]
    if time_part
        .get(JSONLOGIC_VAR)
        .and_then(|v| v.as_str())
        == Some(TIMESTAMP_VAR)
    {
        if let Some(n) = var_part.as_i64() {
            return Some(n);
        }
    }

    None
}

fn as_if_clause(value: &Value) -> Option<[Value; 3]> {
    let if_val = value.get("if")?;
    let arr = if_val.as_array()?;
    if arr.len() == 3 {
        Some([arr[0].clone(), arr[1].clone(), arr[2].clone()])
    } else {
        None
    }
}

// ─── Targeting building (exportSchema) ───────────────────────────────────────

fn build_targeting_from_time_windows(
    per_env_defs: Option<&HashMap<String, ValueDefinition>>,
    global_value_def: Option<&TimeWindowValue>,
) -> Option<Value> {
    let mut env_time_windows: Vec<(String, i64, Option<i64>)> = Vec::new(); // (name, start, end)

    if let Some(defs) = per_env_defs {
        for (env_name, def) in defs {
            if let Some(tw) = &def.time_window {
                if tw.start_time.is_some() || tw.end_time.is_some() {
                    env_time_windows.push((
                        env_name.to_lowercase(),
                        tw.start_time.unwrap_or(0),
                        tw.end_time,
                    ));
                }
            }
        }
    }

    // Build environment chain
    let mut env_chain: Option<Value> = None;
    for (env_name, start, end) in &env_time_windows {
        let env_condition = json!({
            JSONLOGIC_IN: [
                { JSONLOGIC_VAR: ENV_VAR_NAME },
                [env_name]
            ]
        });

        let time_condition = build_timestamp_condition(*start, *end);

        let full_condition = if let Some(tc) = time_condition {
            json!({ JSONLOGIC_AND: [env_condition, tc] })
        } else {
            env_condition
        };

        env_chain = Some(if let Some(existing) = env_chain {
            json!({ "if": [full_condition, "on", existing] })
        } else {
            json!({ "if": [full_condition, "on", "off"] })
        });
    }

    // Wrap with global time window if present
    if let Some(global) = global_value_def {
        let tw = &global.time_window;
        let global_condition = build_timestamp_condition(
            tw.start_time.unwrap_or(0),
            tw.end_time,
        );

        if let Some(gc) = global_condition {
            let else_value = env_chain.unwrap_or(json!("off"));
            return Some(json!({
                "if": [gc, global.value.clone(), else_value]
            }));
        }
    }

    env_chain
}

fn build_timestamp_condition(start: i64, end: Option<i64>) -> Option<Value> {
    let mut conditions: Vec<Value> = Vec::new();

    if start != 0 {
        conditions.push(json!({
            ">=": [{ JSONLOGIC_VAR: TIMESTAMP_VAR }, start]
        }));
    }

    if let Some(e) = end {
        conditions.push(json!({
            "<=": [{ JSONLOGIC_VAR: TIMESTAMP_VAR }, e]
        }));
    }

    match conditions.len() {
        0 => None,
        1 => Some(conditions.remove(0)),
        _ => Some(json!({ JSONLOGIC_AND: conditions })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use serde_json::json;

    fn make_db() -> Database {
        Database::new()
    }

    #[test]
    fn test_create_and_list_files() {
        let mut db = make_db();
        create_file(&mut db, "demo").unwrap();
        create_file(&mut db, "production").unwrap();
        let files = list_files(&db);
        assert_eq!(files, vec!["demo", "production"]);
    }

    #[test]
    fn test_create_file_duplicate_fails() {
        let mut db = make_db();
        create_file(&mut db, "demo").unwrap();
        assert!(create_file(&mut db, "demo").is_err());
    }

    #[test]
    fn test_delete_file() {
        let mut db = make_db();
        create_file(&mut db, "demo").unwrap();
        delete_file(&mut db, "demo").unwrap();
        assert!(list_files(&db).is_empty());
    }

    #[test]
    fn test_import_schema_boolean_flag() {
        let mut db = make_db();
        let schema = json!({
            "flags": {
                "feature-flag": {
                    "state": "ENABLED",
                    "variants": { "on": true, "off": false },
                    "defaultVariant": "on"
                }
            }
        });
        import_schema(&mut db, "demo", &schema.to_string()).unwrap();

        let flags = get_flags(&db, "demo").unwrap();
        assert_eq!(flags.len(), 1);
        assert_eq!(flags[0].key, "feature-flag");
        assert_eq!(flags[0].flag_type, FlagType::Boolean);
        assert_eq!(flags[0].state, FlagState::Enabled);
        assert_eq!(flags[0].value, Some(Value::Bool(true)));
    }

    #[test]
    fn test_import_schema_environments() {
        let mut db = make_db();
        let schema = json!({
            "flags": {},
            "$evaluators": {
                "isProduction": {
                    "in": [{ "var": "environment" }, ["prod", "production"]]
                },
                "isStaging": {
                    "in": [{ "var": "environment" }, ["staging"]]
                }
            }
        });
        import_schema(&mut db, "demo", &schema.to_string()).unwrap();

        let envs = get_environments(&db, "demo").unwrap();
        assert_eq!(envs.len(), 2);
        let names: Vec<&str> = envs.iter().map(|e| e.display_name.as_str()).collect();
        assert!(names.contains(&"Production"));
        assert!(names.contains(&"Staging"));
    }

    #[test]
    fn test_export_schema_roundtrip() {
        let mut db = make_db();
        let schema_str = json!({
            "$schema": "https://flagd.dev/schema/v0/flags.json",
            "flags": {
                "my-flag": {
                    "state": "ENABLED",
                    "variants": { "on": true },
                    "defaultVariant": "on"
                }
            }
        })
        .to_string();

        import_schema(&mut db, "demo", &schema_str).unwrap();
        let exported = export_schema(&db, "demo").unwrap();
        let parsed: FlagdSchema = serde_json::from_str(&exported).unwrap();
        assert!(parsed.flags.contains_key("my-flag"));
    }

    #[test]
    fn test_create_or_update_flag() {
        let mut db = make_db();
        create_file(&mut db, "demo").unwrap();

        let flag = DisplayFlag {
            key: "new-flag".to_string(),
            flag_type: FlagType::String,
            state: FlagState::Enabled,
            value: Some(Value::String("hello".to_string())),
            metadata: None,
            per_environment_definitions: None,
            global_time_window: None,
        };

        create_or_update_flag(&mut db, "demo", flag, None).unwrap();
        let result = get_flag(&db, "demo", "new-flag").unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().value, Some(Value::String("hello".to_string())));
    }

    #[test]
    fn test_delete_flag() {
        let mut db = make_db();
        let schema = json!({
            "flags": {
                "my-flag": {
                    "state": "ENABLED",
                    "variants": { "default": "value" },
                    "defaultVariant": "default"
                }
            }
        });
        import_schema(&mut db, "demo", &schema.to_string()).unwrap();
        delete_flag(&mut db, "demo", "my-flag").unwrap();
        let flags = get_flags(&db, "demo").unwrap();
        assert!(flags.is_empty());
    }

    #[test]
    fn test_environment_crud() {
        let mut db = make_db();
        create_file(&mut db, "demo").unwrap();

        create_or_update_environment(
            &mut db,
            "demo",
            Environment {
                display_name: "Production".to_string(),
                aliases: vec!["prod".to_string(), "production".to_string()],
            },
        )
        .unwrap();

        let envs = get_environments(&db, "demo").unwrap();
        assert_eq!(envs.len(), 1);
        assert_eq!(envs[0].display_name, "Production");

        delete_environment(&mut db, "demo", "Production").unwrap();
        assert!(get_environments(&db, "demo").unwrap().is_empty());
    }

    #[test]
    fn test_import_schema_with_time_windows() {
        let start_time: i64 = 1704067200;
        let end_time: i64 = 1735689599;

        let mut db = make_db();
        let schema = json!({
            "flags": {
                "seasonal-feature": {
                    "state": "ENABLED",
                    "variants": { "on": true, "off": false },
                    "defaultVariant": "off",
                    "targeting": {
                        "if": [
                            {
                                "and": [
                                    { "in": [{ "var": "environment" }, ["production"]] },
                                    {
                                        "and": [
                                            { ">=": [{ "var": "$flagd.timestamp" }, start_time] },
                                            { "<=": [{ "var": "$flagd.timestamp" }, end_time] }
                                        ]
                                    }
                                ]
                            },
                            "on",
                            "off"
                        ]
                    }
                }
            },
            "$evaluators": {
                "isProduction": {
                    "in": [{ "var": "environment" }, ["production"]]
                }
            }
        });
        import_schema(&mut db, "demo", &schema.to_string()).unwrap();

        let flags = get_flags(&db, "demo").unwrap();
        assert_eq!(flags.len(), 1);
        let per_env = flags[0].per_environment_definitions.as_ref().unwrap();
        let prod_def = per_env.get("Production").unwrap();
        let tw = prod_def.time_window.as_ref().unwrap();
        assert_eq!(tw.start_time, Some(start_time));
        assert_eq!(tw.end_time, Some(end_time));
    }
}
