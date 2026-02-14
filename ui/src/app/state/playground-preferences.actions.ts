import { PlaygroundServer } from '../models/playground.models';

export class SetPlaygroundServers {
  static readonly type = '[PlaygroundPreferences] Set Servers';

  constructor(readonly servers: PlaygroundServer[]) {}
}

export class SetPlaygroundDrawerHeight {
  static readonly type = '[PlaygroundPreferences] Set Drawer Height';

  constructor(readonly drawerHeight: number) {}
}