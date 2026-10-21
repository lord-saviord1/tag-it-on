import type { Scent } from "@/lib/scents";

type Colors = Pick<Scent, "body" | "ball" | "base" | "trim" | "accent" | "accentDeep" | "fx" | "slug">;

/** An empty placeholder in the layout. The single 3D bottle (SceneCanvas) glides
 *  to whichever slot is nearest the middle of the screen and takes on its colors. */
export default function BottleSlot({ colors, label }: { colors: Colors; label: string }) {
  return (
    <div
      className="bottle-slot"
      data-bottle-slot=""
      data-body={colors.body}
      data-ball={colors.ball}
      data-base={colors.base}
      data-trim={colors.trim}
      data-accent={colors.accent}
      data-deep={colors.accentDeep}
      data-fx={colors.fx}
      data-tex={colors.slug}
      data-label={label}
      aria-hidden="true"
    />
  );
}
