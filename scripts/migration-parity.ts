const MIGRATION_FILE_PATTERN = /^(\d{14})_.+\.sql$/;

export type MigrationDrift = {
  missingOnRemote: string[];
  extraOnRemote: string[];
};

export function localMigrationVersions(fileNames: string[]): string[] {
  return fileNames
    .map((fileName) => fileName.match(MIGRATION_FILE_PATTERN)?.[1])
    .filter((version): version is string => version !== undefined)
    .sort();
}

export function compareMigrationVersions(
  local: string[],
  remote: string[],
): MigrationDrift {
  const remoteSet = new Set(remote);
  const localSet = new Set(local);

  return {
    missingOnRemote: local.filter((version) => !remoteSet.has(version)).sort(),
    extraOnRemote: remote.filter((version) => !localSet.has(version)).sort(),
  };
}
