import { useLauncher, useManagedInstance } from "../state/LauncherProvider";
import { SegmentedControl } from "./ui";

/** Switches the instance the management tabs operate on. Hidden when there is only one. */
export default function InstanceSelector({ className }: { className?: string }) {
  const { instances, selectInstance } = useLauncher();
  const managed = useManagedInstance();
  const playable = instances.filter((i) => i.status === "playable");
  if (playable.length <= 1) return null;

  return (
    <SegmentedControl
      label="Modpack"
      className={className}
      value={managed.id}
      onChange={selectInstance}
      options={playable.map((inst) => ({
        value: inst.id,
        label: inst.name.replace("PETABLOCKS ", ""),
      }))}
    />
  );
}
