import { Monitor, Moon, Sun } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setThemeMode, useThemeMode, type ThemeMode } from "@/lib/theme-store";

const OPTIONS: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Terang", Icon: Sun },
  { value: "dark", label: "Gelap", Icon: Moon },
  { value: "system", label: "Ikuti sistem", Icon: Monitor },
];

export function ThemeToggle() {
  const mode = useThemeMode();

  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={mode}
      // A toggle group, not a menu item: picking a theme should not close the
      // menu, so the result is visible while still choosing.
      onValueChange={(next) => next && setThemeMode(next as ThemeMode)}
      className="justify-start gap-1"
      aria-label="Tampilan"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="h-7 w-9"
        >
          <Icon className="h-4 w-4" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
