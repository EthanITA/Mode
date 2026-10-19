let heard: string | undefined;

export const Extension = {
  hear: (): void => void (heard = new Date().toISOString()),
  heard: (): string | undefined => heard,
};
