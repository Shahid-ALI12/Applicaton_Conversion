
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, description }: { title: string; subtitle?: string; description?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">{title}</h1>
        {(subtitle || description) && <p className="text-sm text-slate-500 mt-1">{subtitle || description}</p>}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  title,
  value,
  color = "blue",
  prefix = "",
  suffix = "",
  icon: Icon,
  iconColor,
  words,
}: {
  label?: string;
  title?: string;
  value: string | number;
  color?: "blue" | "purple" | "green" | "orange" | "amber" | string;
  prefix?: string;
  suffix?: string;
  icon?: LucideIcon;
  iconColor?: string;
  /** Optional: English counting words shown below the value */
  words?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "border-t-blue-600 text-blue-600",
    purple: "border-t-purple-600 text-purple-600",
    green: "border-t-green-600 text-green-600",
    orange: "border-t-orange-600 text-orange-600",
    amber: "border-t-amber-600 text-amber-600",
  };

  const colorClasses = colorMap[color] || `border-t-slate-400 text-slate-600`;
  const textColor = colorClasses.split(" ")[1] || "text-slate-600";
  const borderColor = colorClasses.split(" ")[0] || "border-t-slate-400";
  const displayLabel = label || title || "";

  if (Icon) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className={cn("text-xs font-bold uppercase tracking-wider", "text-slate-500")}>
              {displayLabel}
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {prefix}{value}{suffix}
            </div>
            {words && <div className="text-[0.68rem] text-slate-400 mt-1 leading-tight capitalize">{words}</div>}
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconColor || "bg-slate-100")}>
            <Icon className={cn("w-5 h-5", iconColor?.replace("bg-", "text-")?.split("-")[0] ? (iconColor || "text-slate-500") : "text-slate-500")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] shadow-sm", borderColor)}>
      <div className={cn("text-xs font-bold uppercase tracking-wider", textColor)}>
        {displayLabel}
      </div>
      <div className={cn("text-2xl font-extrabold text-slate-900 mt-1", textColor)}>
        {prefix}{value}{suffix}
      </div>
      {words && <div className="text-[0.68rem] text-slate-400 mt-1 leading-tight capitalize">{words}</div>}
    </div>
  );
}