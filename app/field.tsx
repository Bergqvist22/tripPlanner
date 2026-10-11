import { cloneElement, useId, type ReactElement } from "react";
import styles from "./form.module.css";

// A labelled input, select or textarea. Its id is generated: a page that is
// left stays in the document as it was, so two fields of the same name can be
// there at once, and each label has to reach its own.
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
