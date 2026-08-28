import type { PackMetadata } from "./packInstaller";
import type { InstallPlan } from "./packInstaller";

export function isPackMetadataFieldPopulated(value: string): boolean {
  return value.trim().length > 0;
}

export function isPackMetadataValid(metadata: PackMetadata): boolean {
  return (
    isPackMetadataFieldPopulated(metadata.textureldr) &&
    isPackMetadataFieldPopulated(metadata.name) &&
    isPackMetadataFieldPopulated(metadata.id) &&
    isPackMetadataFieldPopulated(metadata.version) &&
    isPackMetadataFieldPopulated(metadata.author)
  );
}

export function installPlanHasInvalidPackMetadata(plan: InstallPlan): boolean {
  return plan.units.some(
    (unit) =>
      unit.enabled &&
      unit.kind === "pack" &&
      unit.metadata !== undefined &&
      !isPackMetadataValid(unit.metadata),
  );
}
