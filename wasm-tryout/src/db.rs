use crate::models::DisplayFlag;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Internal state for a single flagd file
#[derive(Debug, Default, Clone)]
pub struct FileState {
    /// Environment name (lowercase) -> list of aliases
    pub environment_aliases: HashMap<String, Vec<String>>,
    /// Flag key -> DisplayFlag
    pub flags_map: HashMap<String, DisplayFlag>,
    /// File-level metadata
    pub metadata: Option<HashMap<String, Value>>,
}

/// In-memory database holding multiple flagd file states, keyed by file name
#[derive(Debug, Default, Clone)]
pub struct Database {
    pub files: HashMap<String, FileState>,
}

impl Database {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Thread-safe, shared reference to the database
pub type SharedDatabase = Arc<RwLock<Database>>;

/// Create a new shared (thread-safe) database instance
pub fn new_shared_database() -> SharedDatabase {
    Arc::new(RwLock::new(Database::new()))
}
