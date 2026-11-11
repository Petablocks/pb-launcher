import { useEffect, useState } from "react";
import { useLauncher } from "../state/LauncherProvider";
import ChangelogModal from "./play/ChangelogModal";
import InstanceCard from "./play/InstanceCard";
import LogDrawer from "./play/LogDrawer";
import StatusArea from "./play/StatusArea";

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
    <div className="flex h-full flex-col gap-4">
      <div className="grid min-h-[440px] flex-1 grid-cols-2 gap-4">
        {instances.map((inst) => (
          <InstanceCard key={inst.id} inst={inst} />
        ))}
      </div>

      <StatusArea
        inst={selectedInstance}
        onShowLogs={() => setShowLogs(true)}
        onShowChangelog={() => setShowChangelog(true)}
      />

      {showLogs && <LogDrawer inst={selectedInstance} onClose={() => setShowLogs(false)} />}

      <ChangelogModal
        inst={selectedInstance}
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
      />
    </div>
  );
}
