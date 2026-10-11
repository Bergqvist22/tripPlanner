import { useId, type ReactNode } from "react";

// A section of a page, named by its heading. The heading's id is generated,
// for the same reason as a Field's.
export function Section({
  heading,
  className,
  children,
}: {
  heading: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={className} aria-labelledby={id}>
      <h2 id={id}>{heading}</h2>
      {children}
    </section>
  );
}
