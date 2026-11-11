import { useEffect, useState } from "react";
import { DownloadCloud, FileText } from "lucide-react";
import { Alert, Button, LoadingState, Modal } from "../../components/ui";
import { Instance } from "../../instances";
import { ParsedRelease, ReleaseCard, parseChangelog } from "../../lib/changelog";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";
import { getChangelog } from "../../sync";

export default function ChangelogModal({
  inst,
  open,
  onClose,
}: {
  inst: Instance;
  open: boolean;
  onClose: () => void;
}) {
  const { runtimeOf, sync, activeInstanceId } = useLauncher();
  const { hasUpdate, latestVersion, installedVersion } = getVersionInfo(runtimeOf(inst.id));
  const [releases, setReleases] = useState<ParsedRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReleases(null);
    setError(null);
    getChangelog(inst.id, inst.changelogUrl ?? "")
      .then((text) => {
        if (!cancelled) setReleases(parseChangelog(text));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, inst.id, inst.changelogUrl]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${inst.name} release notes`}
      icon={<FileText size={18} className="shrink-0 text-pb-cyan" />}
      footer={
        <>
          <span className="text-2xs text-pb-muted">
            {latestVersion ? `Latest: v${latestVersion}` : ""}
            {installedVersion ? ` · Installed: v${installedVersion}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            {hasUpdate && (
              <Button
                variant="primary"
                icon={<DownloadCloud size={14} />}
                disabled={activeInstanceId !== null}
                onClick={() => {
                  onClose();
                  sync(inst);
                }}
              >
                Update now
              </Button>
            )}
          </div>
        </>
      }
    >
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : releases === null ? (
        <LoadingState>Loading release notes…</LoadingState>
      ) : releases.length === 0 ? (
        <p className="py-8 text-center text-xs text-pb-muted">No release notes have been published yet.</p>
      ) : (
        <div className="space-y-4">
          {releases.map((rel, idx) => (
            <ReleaseCard
              key={`${rel.version}-${idx}`}
              release={rel}
              compact
              badge={
                rel.version === installedVersion ? { label: "Installed", tone: "mint" } : undefined
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
