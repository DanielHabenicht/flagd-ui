use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// State of a feature flag
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FlagState {
    Enabled,
    Disabled,
}

/// Type of a feature flag, inferred from variant values
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FlagType {
    Boolean,
    String,
    Number,
    Object,
}

/// Environment as displayed in the UI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    /// Human-readable environment name (e.g. "Production")
    pub display_name: String,
    /// How the environment is matched in context (e.g. ["prod", "production"])
    pub aliases: Vec<String>,
}

/// A time window defined by optional start and end Unix timestamps (seconds)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeWindow {
    /// Optional start of the time window as a Unix timestamp (seconds)
    pub start_time: Option<i64>,
    /// Optional end of the time window as a Unix timestamp (seconds)
    pub end_time: Option<i64>,
}

/// A value associated with an optional time window
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueDefinition {
    pub value: Value,
    pub time_window: Option<TimeWindow>,
}

/// A value that is only active within a specific time window
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeWindowValue {
    pub value: Value,
    pub time_window: TimeWindow,
}

/// Internal representation of a feature flag for display and editing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayFlag {
    pub key: String,
    #[serde(rename = "type")]
    pub flag_type: FlagType,
    pub state: FlagState,
    pub value: Option<Value>,
    pub metadata: Option<HashMap<String, Value>>,
    /// Per-environment value overrides, keyed by environment display name
    pub per_environment_definitions: Option<HashMap<String, ValueDefinition>>,
    /// A global time-bounded value override
    pub global_time_window: Option<TimeWindowValue>,
}

/// A complete flagd JSON flag file (raw schema)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagdSchema {
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub flags: HashMap<String, RawFlagDefinition>,
    #[serde(rename = "$evaluators", skip_serializing_if = "Option::is_none")]
    pub evaluators: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, Value>>,
}

/// Raw flag definition as found in a flagd JSON schema
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFlagDefinition {
    pub state: String,
    pub variants: HashMap<String, Value>,
    pub default_variant: Option<String>,
    pub targeting: Option<Value>,
    pub metadata: Option<HashMap<String, Value>>,
}
