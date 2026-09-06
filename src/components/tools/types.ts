export type PickFolderOptions = {
  /** When false, keep the real path (Settings / GD override). Default true. */
  importToSandbox?: boolean;
};

export type PickFolderFn = (
  assign: (path: string) => void,
  options?: PickFolderOptions,
) => Promise<void>;
