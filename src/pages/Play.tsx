import { useEffect, useState } from "react";
import { useLauncher } from "../state/LauncherProvider";
import ChangelogModal from "./play/ChangelogModal";
import InstanceHero from "./play/InstanceHero";
import InstanceTile from "./play/InstanceTile";
import LogDrawer from "./play/LogDrawer";
import SetupChecklist from "./play/SetupChecklist";

export default function Play() {
  const { instances, selectedInstance, runtimeOf } = useLauncher();
  const [showLogs, setShowLogs] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const crashed = Boolean(runtimeOf(selectedInstance.id).crash);

  // A crash is the one case where the log should open without being asked.
  useEffect(() => {
    if (crashed) setShowLogs(true);
  }, [crashed]);

  return (
    <div className="flex min-h-full flex-col gap-4">
      <SetupChecklist />

      <InstanceHero
        inst={selectedInstance}
        onShowLogs={() => setShowLogs(true)}
        onShowChangelog={() => setShowChangelog(true)}
      />

      {instances.length > 1 && (
        <nav aria-label="Servers" className="flex shrink-0 gap-3">
          {instances.map((inst) => (
            <InstanceTile key={inst.id} inst={inst} />
          ))}
        </nav>
      )}

      {showLogs && <LogDrawer inst={selectedInstance} onClose={() => setShowLogs(false)} />}

      <ChangelogModal
        inst={selectedInstance}
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
      />
    </div>
  );
}
