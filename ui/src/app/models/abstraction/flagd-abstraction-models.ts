/**
 * Frontend domain models for flag editing UI
 * These represent the "what" the UI displays, abstracting away FlagdSchema complexity
 */

export type FlagState = 'ENABLED' | 'DISABLED';
export type FlagType = 'boolean' | 'string' | 'number' | 'object';

/**
 * Represents a time window constraint (e.g., flag is on between 2pm-5pm)
 */
export interface TimeWindow {
  startTime?: number; // Unix timestamp
  endTime?: number; // Unix timestamp
}

/**
 * Environment as displayed in the UI
 */
export interface Environment {
  displayName: string; // human-readable (e.g., "Production")
  aliases: string[]; // how it's matched in context
}

/**
 * Target group for conditional flag logic
 */
export interface EnvironmentDefinition<T> {
  value: T;
  timeWindow?: TimeWindow;
}

/**
 * Common properties for all flag types
 */
interface BaseFlagProps {
  state: FlagState;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Typed flag definitions for frontend display/editing
 */
export interface BooleanFlag extends BaseFlagProps {
  type: 'boolean';
  value: boolean | null;
  perEnvironmentDefinitions?: Record<string, EnvironmentDefinition<boolean>>;
}

export interface StringFlag extends BaseFlagProps {
  type: 'string';
  value: string | null;
  perEnvironmentDefinitions?: Record<string, EnvironmentDefinition<string>>;
}

export interface NumberFlag extends BaseFlagProps {
  type: 'number';
  value: number | null;
  perEnvironmentDefinitions?: Record<string, EnvironmentDefinition<number>>;
}

export interface ObjectFlag extends BaseFlagProps {
  type: 'object';
  value: object | null;
  perEnvironmentDefinitions?: Record<string, EnvironmentDefinition<object>>;
}

/**
 * Union type representing any flag
 */
export type DisplayFlag = BooleanFlag | StringFlag | NumberFlag | ObjectFlag;
