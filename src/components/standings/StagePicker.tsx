import Link from "next/link";
import type { Stage } from "@/lib/types";

const STATUS_LABEL: Record<Stage["status"], string> = {
  upcoming: "Upcoming",
  draft_open: "Drafting",
  locked: "Locked",
  finalized: "Final",
};

/**
 * Stage selector for the history page — plain server-rendered links so the
 * page works with no client JS, driven by the `?stage=` search param.
 */
export function StagePicker({
  stages,
  selectedStageId,
}: {
  stages: Stage[];
  selectedStageId: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      {stages.map((stage) => {
        const isSelected = stage.id === selectedStageId;
        return (
          <Link
            key={stage.id}
            href={`/history?stage=${stage.id}`}
            className={[
              "font-pixel text-[10px] uppercase px-3 py-2 border-2 whitespace-nowrap transition-colors",
              isSelected
                ? "bg-retro-yellow text-field border-black"
                : "border-retro-offwhite/40 text-retro-offwhite/80 hover:border-retro-offwhite hover:text-retro-yellow",
            ].join(" ")}
          >
            {stage.name}
            <span className="ml-2 opacity-70">{STATUS_LABEL[stage.status]}</span>
          </Link>
        );
      })}
    </div>
  );
}
