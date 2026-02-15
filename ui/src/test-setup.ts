if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        addListener: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeListener: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        addEventListener: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
