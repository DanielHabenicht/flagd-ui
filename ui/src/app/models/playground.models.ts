export type PlaygroundProviderType = 'flagd' | 'ofrep';

export interface PlaygroundServer {
  id: string;
  provider: PlaygroundProviderType;
  url: string;
}
