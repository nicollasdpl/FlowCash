import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const icons = LucideIcons as unknown as Record<string, LucideIcon>;

interface Props {
  icon: string;
  color?: string;
  size?: number;
}

export default function CategoryIcon({ icon, color = "currentColor", size = 18 }: Props) {
  const Comp = icons[icon];
  if (typeof Comp === "function") {
    return <Comp size={size} strokeWidth={1.5} color={color} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

export function iconLabel(icon: string, name: string): string {
  return typeof icons[icon] === "function" ? name : `${icon} ${name}`;
}
