import * as LucideIcons from "lucide-react";
import type { ElementType } from "react";

interface Props {
  icon: string;
  color?: string;
  size?: number;
}

export default function CategoryIcon({ icon, color = "currentColor", size = 18 }: Props) {
  const IconComponent = LucideIcons[icon as keyof typeof LucideIcons] as ElementType<{
    size?: number;
    strokeWidth?: number;
    color?: string;
  }> | undefined;

  if (IconComponent) {
    return <IconComponent size={size} strokeWidth={1.5} color={color} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

export function iconLabel(icon: string, name: string): string {
  const comp = LucideIcons[icon as keyof typeof LucideIcons];
  return comp !== undefined ? name : `${icon} ${name}`;
}

export function isLucideIcon(name: string): boolean {
  return LucideIcons[name as keyof typeof LucideIcons] !== undefined;
}
