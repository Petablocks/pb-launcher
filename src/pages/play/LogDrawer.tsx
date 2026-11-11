import { useEffect, useRef } from "react";
import { Copy, FolderOpen, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { Instance } from "../../instances";
import { getInstanceDir } from "../../launch";
import { useGameLogs } from "../../state/logStore";

/** Live game output for one instance. Follows the tail unless the player scrolls up. */
export default function LogDrawer({ inst, onClose }: { inst: Instance; onClose: () => void }) {
  const logs = useGameLogs(inst.id);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  function copyAll() {
    navigator.clipboard.writeText(logs.map((l) => l.line).join("\n")).catch(() => {});
  }

  return (
    <section aria-label="Game log" className="rounded-xl border border-white/10 bg-black/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">
          Game log <span className="font-normal text-pb-muted">· {logs.length} lines</span>
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={copyAll} disabled={logs.length === 0}>
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FolderOpen size={12} />}
            onClick={() => getInstanceDir(inst.id).catch(() => {})}
          >
            Open folder
          </Button>
          <IconButton label="Close game log" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="h-44 select-text overflow-y-auto whitespace-pre-wrap break-all font-mono text-2xs text-pb-muted"
      >
        {logs.length === 0 ? (
          <div className="py-6 text-center">No game output yet. It appears here once Minecraft starts.</div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className={l.isError ? "text-red-400" : undefined}>
              {l.line}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
