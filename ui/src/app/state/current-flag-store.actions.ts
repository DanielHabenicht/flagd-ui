// import { DisplayFlag, Environment } from '../models/abstraction/flagd-abstraction-models';
// import { BackendType } from './flag-file-store.actions';

// /**
//  * Actions for managing the current flag file state.
//  * Inspired by FlagdSchemaAbstraction API.
//  */

// export class LoadFlagFile {
//   static readonly type = '[CurrentFlagStore] Load Flag File';
//   constructor(
//     readonly backendType: BackendType,
//     readonly backendUri: string,
//     readonly fileName: string,
//   ) {}
// }

// export class ClearFlagFile {
//   static readonly type = '[CurrentFlagStore] Clear Flag File';
// }

// export class CreateOrUpdateFlag {
//   static readonly type = '[CurrentFlagStore] Create Or Update Flag';
//   constructor(
//     readonly flag: DisplayFlag,
//     readonly previousKey?: string,
//   ) {}
// }

// export class DeleteFlag {
//   static readonly type = '[CurrentFlagStore] Delete Flag';
//   constructor(readonly flagKey: string) {}
// }

// export class CreateOrUpdateEnvironment {
//   static readonly type = '[CurrentFlagStore] Create Or Update Environment';
//   constructor(readonly environment: Environment) {}
// }

// export class DeleteEnvironment {
//   static readonly type = '[CurrentFlagStore] Delete Environment';
//   constructor(readonly displayName: string) {}
// }

// export class SetMetadata {
//   static readonly type = '[CurrentFlagStore] Set Metadata';
//   constructor(readonly metadata: Record<string, string | number | boolean>) {}
// }
