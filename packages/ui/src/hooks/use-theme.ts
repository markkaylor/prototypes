import { useEffect, useState } from "react"

export type Theme = "system" | "light" | "dark"
const ORDER: Theme[] = ["system", "light", "dark"]

/** Applies the .dark class to <html>. Defaults to the OS setting and follows it live. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)")
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches))
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme])

  const cycleTheme = () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length])
  return { theme, setTheme, cycleTheme }
}
