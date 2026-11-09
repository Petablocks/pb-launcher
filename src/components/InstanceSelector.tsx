import { INSTANCES, Instance } from "../instances";

interface InstanceSelectorProps {
  selectedInstanceId: string;
  onSelectInstance: (id: string) => void;
  className?: string;
  showAll?: boolean;
}

export default function InstanceSelector({
  selectedInstanceId,
  onSelectInstance,
  className = "",
  showAll = false,
}: InstanceSelectorProps) {
  const instances = showAll
    ? INSTANCES
    : INSTANCES.filter((i) => i.status === "playable");

  if (instances.length <= 1) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#0d1424]/80 p-1 backdrop-blur-md ${className}`}
    >
      {instances.map((inst) => {
        const isSelected = inst.id === selectedInstanceId;
        return (
          <button
            key={inst.id}
            type="button"
            onClick={() => onSelectInstance(inst.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              isSelected
                ? "bg-pb-cyan text-[#031617] shadow-sm shadow-pb-cyan/20"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isSelected ? "bg-[#031617]" : "bg-pb-cyan"
              }`}
            />
            {inst.name.replace("PETABLOCKS ", "")}
          </button>
        );
      })}
    </div>
  );
}
