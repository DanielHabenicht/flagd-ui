/**
 * Frontend domain models for flag editing UI
 * These represent the "what" the UI displays, abstracting away FlagdSchema complexity
 */

export type FlagState = 'ENABLED' | 'DISABLED';
export type FlagType = 'boolean' | 'string' | 'number' | 'object';

interface TimeWindowStart {
  startTime: Date;
  endTime?: Date;
}
interface TimeWindowEnd {
  startTime?: Date;
  endTime: Date;
}
export type TimeWindow = TimeWindowStart | TimeWindowEnd;

/**
 * Environment as displayed in the UI
 */
export interface Environment {
  displayName: string; // human-readable (e.g., "Production")
  aliases: string[]; // how it's matched in context
}

export interface TimeWindowValue<T> {
  value: T;
  timeWindow: TimeWindow;
}

/**
 * Target group for conditional flag logic
 */
export interface ValueDefinition<T> {
  value: T;
  timeWindow?: TimeWindow;
}

// interface BaseFlagProps<TValue, TType extends string> {
//   key: string;
//   type: TType;
//   state: FlagState;
//   metadata?: Record<string, string | number | boolean>;
//   value: TValue | null;
//   perEnvironmentDefinitions?: Record<string, ValueDefinition<TValue>>;
//   globalTimeWindow?: TimeWindowValue<TValue>;
// }

// export type BooleanFlag = BaseFlagProps<boolean, 'boolean'>;
// export type StringFlag = BaseFlagProps<string, 'string'>;
// export type NumberFlag = BaseFlagProps<number, 'number'>;
// export type ObjectFlag = BaseFlagProps<object, 'object'>;

// /**
//  * Union type representing any flag
//  */
// export type DisplayFlag = BooleanFlag | StringFlag | NumberFlag | ObjectFlag;
