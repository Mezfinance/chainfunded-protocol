import { useState } from "react";
import { Star } from "lucide-react";

/**
 * StarRating — display (read-only) or interactive star picker.
 * Pass `value` + `onChange` for input; omit `onChange` for display.
 */
export default function StarRating({ value = 0, onChange, size = 18, className = "" }) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === "function";
  const shown = interactive ? (hover || value) : value;

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} role={interactive ? "radiogroup" : "img"} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        const star = (
          <Star
            style={{ width: size, height: size }}
            className={filled ? "text-primary" : "text-muted-foreground/30"}
            fill={filled ? "currentColor" : "none"}
            strokeWidth={filled ? 0 : 1.6}
          />
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            className="p-0.5 -m-0.5 transition-transform hover:scale-110"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}
