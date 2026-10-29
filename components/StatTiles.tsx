import type { ReactNode } from "react";
import styles from "./stat-tiles.module.css";

export interface StatTile {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** CSS colour for the icon, when the tile carries a state (in/out/open...). */
  tone?: string;
}

/** Money strings glue the currency with a non-breaking space, which would make a
 * long total spill past the tile edge. Allow the currency to drop to its own line. */
function displayValue(value: ReactNode): ReactNode {
  return typeof value === "string" ? value.replace(/\u00a0/g, " ") : value;
}

/** Summary tiles shared by the dashboard list and detail screens. */
export default function StatTiles({
  items,
  size = "md",
  label,
}: {
  items: StatTile[];
  size?: "md" | "lg";
  label?: string;
}) {
  return (
    <section aria-label={label} className={styles.grid} data-size={size}>
      {items.map((item) => (
        <div key={item.label} className={`glass ${styles.tile}`}>
          <p className={styles.label}>
            <span
              className={styles.icon}
              data-toned={Boolean(item.tone)}
              style={item.tone ? { color: item.tone } : undefined}
            >
              {item.icon}
            </span>
            {item.label}
          </p>
          <p className={styles.value}>{displayValue(item.value)}</p>
        </div>
      ))}
    </section>
  );
}
