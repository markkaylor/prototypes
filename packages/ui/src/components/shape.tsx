import { cn } from "@prototypes/ui/lib/utils"

/**
 * The three Bauhaus forms, with Kandinsky's colour pairing as the default:
 * circle = blue, square = red, triangle = yellow. See docs/design-guidelines.md.
 */
export type ShapeKind = "circle" | "square" | "triangle"

export const SHAPE_COLOR: Record<ShapeKind, string> = {
  circle: "bg-blue",
  square: "bg-red",
  triangle: "bg-yellow",
}

const FORM: Record<ShapeKind, string> = {
  circle: "rounded-full",
  square: "",
  triangle: "[clip-path:polygon(50%_0,100%_100%,0_100%)]",
}

export function Shape({ kind, className, ...props }: { kind: ShapeKind } & React.ComponentProps<"div">) {
  return <div aria-hidden data-shape={kind} className={cn("shrink-0", FORM[kind], SHAPE_COLOR[kind], className)} {...props} />
}
