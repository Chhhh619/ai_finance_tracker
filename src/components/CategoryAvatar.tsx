import { CATEGORY_ICONS } from "../lib/category-icons";
import type { Category } from "../types";

type Props = {
  category: Pick<Category, "name" | "color" | "icon"> | null | undefined;
  size?: number;
  className?: string;
};

export default function CategoryAvatar({ category, size = 36, className = "" }: Props) {
  const color = category?.color ?? "#9298a6";
  const iconKey = category?.icon ?? null;
  const Icon = iconKey ? CATEGORY_ICONS[iconKey] : null;
  const radius = Math.round(size * 0.28);

  return (
    <div
      className={`rounded-xl flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ backgroundColor: color, width: size, height: size, borderRadius: radius }}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.55)} weight="duotone" color="#ffffff" />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.4) }}>{(category?.name ?? "?")[0]?.toUpperCase()}</span>
      )}
    </div>
  );
}
