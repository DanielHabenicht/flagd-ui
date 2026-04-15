// /**
//  * Actions for managing flag file backends and files.
//  */

// export type BackendType = 'local' | 'remote';

// export class AddBackend {
//   static readonly type = '[FlagFileStore] Add Backend';
//   constructor(
//     readonly label: string,
//     readonly uri: string,
//   ) {}
// }

// export class RemoveBackend {
//   static readonly type = '[FlagFileStore] Remove Backend';
//   constructor(
//     readonly backendType: BackendType,
//     readonly uri: string,
//   ) {}
// }

// export class AddFile {
//   static readonly type = '[FlagFileStore] Add File';
//   constructor(
//     readonly backendType: BackendType,
//     readonly uri: string,
//     readonly fileName: string,
//     readonly content: string,
//     readonly isDirty = false,
//   ) {}
// }

// export class RemoveFile {
//   static readonly type = '[FlagFileStore] Remove File';
//   constructor(
//     readonly backendType: BackendType,
//     readonly uri: string,
//     readonly fileName: string,
//   ) {}
// }

// export class UpdateFileContent {
//   static readonly type = '[FlagFileStore] Update File Content';
//   constructor(
//     readonly backendType: BackendType,
//     readonly uri: string,
//     readonly fileName: string,
//     readonly content: string,
//   ) {}
// }

// export class SyncBackends {
//   static readonly type = '[FlagFileStore] Sync Backends';
//   constructor(
//     readonly backendType: BackendType,
//     readonly uri: string,
//   ) {}
// }
