"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#1f2f52] disabled:bg-ink-3",
  secondary: "bg-paper text-ink border border-rule-2 hover:border-ink hover:bg-wash disabled:text-ink-3",
  danger: "bg-paper text-neg border border-[#e3b4b1] hover:bg-neg-wash hover:border-neg disabled:text-ink-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-wash",
};

export function Button({
  variant = "secondary",
  busy = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] px-3 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
    >
      {busy && (
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
}

// Section heads always carry more space above than below; pass `top` only for the first
// head of a column, which sits under the page header.
export function SectionHead({ title, aside, id, top = false }: { title: ReactNode; aside?: ReactNode; id?: string; top?: boolean }) {
  return (
    <div
      className={`mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-ink pb-2 ${top ? "mt-0" : "mt-12"}`}
      id={id}
    >
      <h2 className="font-serif text-[19px] font-semibold leading-tight tracking-[-0.005em] text-ink">{title}</h2>
      {aside && <div className="text-[12.5px] text-ink-3">{aside}</div>}
    </div>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] tracking-[-0.01em] ${className}`}>{children}</span>;
}

export function Cite({ id, active, onHover }: { id: string; active?: boolean; onHover?: (id: string | null) => void }) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(id)}
      onBlur={() => onHover?.(null)}
      className={`rounded-[2px] border px-1.5 py-[1px] font-mono text-[11px] leading-[18px] transition-colors ${
        active ? "border-link bg-[#e3ecf9] text-link" : "border-rule bg-wash text-ink-2 hover:border-rule-2"
      }`}
    >
      {id}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule-2 px-6 py-10 text-center">
      <p className="font-serif text-[17px] text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-[52ch] text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="mt-2 text-[12.5px] text-neg">
      {msg}
    </p>
  );
}
