import {
  UtensilsCrossed, Coffee, Pizza, ShoppingCart,
  Car, Bus, Bike, Fuel,
  Heart, Activity, Pill, Stethoscope,
  Home, Zap, Wifi, Wrench,
  Gamepad2, Music, Film, Tv,
  CreditCard, Wallet, TrendingUp, DollarSign,
  Tag, Star, Gift, Package,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed, Coffee, Pizza, ShoppingCart,
  Car, Bus, Bike, Fuel,
  Heart, Activity, Pill, Stethoscope,
  Home, Zap, Wifi, Wrench,
  Gamepad2, Music, Film, Tv,
  CreditCard, Wallet, TrendingUp, DollarSign,
  Tag, Star, Gift, Package,
};

interface Props {
  icon: string;
  color?: string;
  size?: number;
}

export default function CategoryIcon({ icon, color = "currentColor", size = 18 }: Props) {
  const Comp = ICON_MAP[icon];
  if (Comp) return <Comp size={size} strokeWidth={1.5} color={color} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

export function iconLabel(icon: string, name: string): string {
  return icon in ICON_MAP ? name : `${icon} ${name}`;
}
