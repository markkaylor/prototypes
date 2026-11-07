import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { useTheme } from "@prototypes/ui/hooks/use-theme"

const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }

/** Ghost icon button that cycles system → light → dark. */
export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  const Icon = ICONS[theme]
  return (
    <Button variant="ghost" size="icon" onClick={cycleTheme} aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
      <Icon />
    </Button>
  )
}
