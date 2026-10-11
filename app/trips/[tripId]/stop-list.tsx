"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Stop } from "@/lib/stops";
import { stopDates, stopNights } from "./stop-dates";
import styles from "./stop-list.module.css";

// A Stop being dragged: where it started, where it would land if dropped now,
// how far the pointer has carried it, and how far the Stops it passes move
// aside to make room.
type Drag = { from: number; to: number; offset: number; room: number };

function moved<T>(list: T[], from: number, to: number) {
  const reordered = [...list];
  reordered.splice(to, 0, ...reordered.splice(from, 1));
  return reordered;
}

export function StopList({ tripId, stops }: { tripId: string; stops: Stop[] }) {
  const router = useRouter();
  // The new order is shown at once and holds until the server has confirmed it.
  const [route, showRoute] = useOptimistic(stops);
  const [, startTransition] = useTransition();
  const [drag, setDrag] = useState<Drag>();
  const [error, setError] = useState<string>();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const dragging = useRef<AbortController>(undefined);
  const movedByKeyboard = useRef<string>(undefined);
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => () => dragging.current?.abort(), []);

  // A Stop moved with the arrow keys keeps the focus, so it can be moved on.
  useEffect(() => {
    if (!movedByKeyboard.current) return;
    handles.current.get(movedByKeyboard.current)?.focus();
    movedByKeyboard.current = undefined;
  }, [route]);

  // A reorder is saved as one operation: the whole Route in its new order.
  function saveOrder(order: Stop[]) {
    setError(undefined);
    startTransition(async () => {
      showRoute(order);
      try {
        // One save at a time, so quick moves reach the server in the order made.
        const save = lastSave.current.then(() =>
          fetch(`/api/trips/${tripId}/stops/order`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stopIds: order.map((stop) => stop.id) }),
          }),
        );
        lastSave.current = save.catch(() => undefined);
        const response = await save;
        if (!response.ok) setError((await response.json()).error);
      } catch {
        setError("The new order could not be saved. Check your connection and try again.");
      }
      // Shows the order as the server has it, saved or not.
      router.refresh();
    });
  }

  // Mouse, touch and pen all arrive as pointer events. The rows stay where
  // they are in the document while dragging and are only shifted visually, so
  // the drag is never interrupted by the list being rebuilt under the finger.
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, from: number) {
    if (event.button !== 0 || route.length < 2 || dragging.current) return;
    event.preventDefault();
    const { pointerId, clientY: startY } = event;
    const boxes = route.map((stop) => rows.current.get(stop.id)!.getBoundingClientRect());
    const middle = (box: DOMRect) => box.top + box.height / 2;
    const room = boxes[from].height + (boxes[1].top - boxes[0].bottom);
    let to = from;

    const controller = new AbortController();
    dragging.current = controller;
    const stop = () => {
      controller.abort();
      dragging.current = undefined;
      setDrag(undefined);
    };

    const listen = (type: "pointermove" | "pointerup" | "pointercancel", listener: (event: PointerEvent) => void) =>
      window.addEventListener(type, (event) => event.pointerId === pointerId && listener(event), {
        signal: controller.signal,
      });

    listen("pointermove", (event) => {
      const offset = event.clientY - startY;
      const carried = middle(boxes[from]) + offset;
      to = from;
      boxes.forEach((box, index) => {
        if (index > from && carried > middle(box)) to = Math.max(to, index);
        if (index < from && carried < middle(box)) to = Math.min(to, index);
      });
      setDrag({ from, to, offset, room });
    });
    listen("pointerup", () => {
      stop();
      if (to !== from) saveOrder(moved(route, from, to));
    });
    listen("pointercancel", stop);
    setDrag({ from, to, offset: 0, room });
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, from: number) {
    const to = from + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
    if (to === from) return;
    event.preventDefault();
    if (to < 0 || to >= route.length) return;
    movedByKeyboard.current = route[from].id;
    saveOrder(moved(route, from, to));
  }

  function shift(index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    if (index === drag.from) return { transform: `translateY(${drag.offset}px)` };
    if (index > drag.from && index <= drag.to) return { transform: `translateY(${-drag.room}px)` };
    if (index < drag.from && index >= drag.to) return { transform: `translateY(${drag.room}px)` };
    return undefined;
  }

  if (route.length === 0) {
    return <p className={styles.empty}>No Stops yet. Add the first place on the Route.</p>;
  }

  return (
    <>
      <ol className={`${styles.list} ${drag ? styles.dragging : ""}`}>
        {route.map((stop, index) => (
          <li
            key={stop.id}
            ref={(row) => {
              if (row) rows.current.set(stop.id, row);
              else rows.current.delete(stop.id);
            }}
            className={`${styles.stop} ${drag?.from === index ? styles.dragged : ""}`}
            style={shift(index)}
          >
            <button
              ref={(handle) => {
                if (handle) handles.current.set(stop.id, handle);
                else handles.current.delete(stop.id);
              }}
              type="button"
              className={styles.handle}
              aria-label={`Move ${stop.name}`}
              title="Drag to reorder, or use the arrow keys"
              onPointerDown={(event) => startDrag(event, index)}
              onKeyDown={(event) => moveWithKeyboard(event, index)}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <Link className={styles.open} href={`/trips/${tripId}/stops/${stop.id}`} draggable={false}>
              <span className={styles.name}>{stop.name}</span>
              <span className={styles.dates}>{stopDates(stop)}</span>
            </Link>
            {stop.nights !== null && <span className={styles.nights}>{stopNights(stop.nights)}</span>}
          </li>
        ))}
      </ol>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
