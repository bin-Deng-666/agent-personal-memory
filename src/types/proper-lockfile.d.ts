declare module "proper-lockfile" {
  const lockfile: {
    lock(
      path: string,
      options: {
        realpath: boolean;
        stale: number;
        retries: { retries: number; minTimeout: number; maxTimeout: number };
      },
    ): Promise<() => Promise<void>>;
  };
  export default lockfile;
}
