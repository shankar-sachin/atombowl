// Repairs LaTeX that models commonly get wrong, so KaTeX can render it instead of showing red text.

// Operators that only work in math mode. Inside \text{...} KaTeX reports them as undefined.
const MATH_ONLY = /(\\cdotp|\\cdot|\\times|\\pm|\\approx|\\to|\\rightarrow|\\,|\;|\\!)\s*/;

// \text{eV\cdotp nm} -> \text{eV}\cdot\text{nm}
function splitTextCommands(tex: string): string {
  return tex.replace(/\\(text|textrm|textbf|textit|mbox)\{([^{}]*)\}/g, (whole, cmd, inner) => {
    if (!MATH_ONLY.test(inner)) return whole;
    return inner
      .split(new RegExp(MATH_ONLY.source, "g"))
      .map((part: string, i: number) => {
        if (i % 2 === 1) return part === "\\cdotp" ? "\\cdot" : part;
        return part.trim() ? `\\${cmd}{${part.trim()}}` : "";
      })
      .join("");
  });
}

// Packages and macros KaTeX does not know, mapped to the nearest thing it does.
export function fixMath(tex: string): string {
  let out = String(tex)
    .replace(/\\require\{[^}]*\}/g, "")
    .replace(/\\cdotp\b/g, "\\cdot")
    .replace(/\\SI\{([^{}]*)\}\{([^{}]*)\}/g, "$1\\,\\mathrm{$2}")
    .replace(/\\(?:unit|si)\{([^{}]*)\}/g, "\\mathrm{$1}")
    .replace(/\\ce\{([^{}]*)\}/g, "\\mathrm{$1}")
    .replace(/\\textcelsius\b/g, "^\\circ\\mathrm{C}")
    .replace(/\\micro\b/g, "\\mu")
    .replace(/\\ohm\b/g, "\\Omega")
    .replace(/\\dfrac\b/g, "\\frac");
  out = splitTextCommands(out);
  return out;
}
