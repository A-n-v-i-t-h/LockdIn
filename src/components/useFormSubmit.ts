"use client";

import { useActionState, useTransition, type FormEvent } from "react";

type Payload = { fd: FormData; form: HTMLFormElement };

/**
 * Submits a form to a server action without React's automatic form reset, so a
 * validation error keeps what was typed. `resetOn` clears the form after a
 * result that should (a successful "add"), and `after` runs on every result.
 */
export function useFormSubmit<S>(
  action: (prev: S | undefined, fd: FormData) => Promise<S>,
  opts: { resetOn?: (s: S) => boolean; after?: (s: S) => void } = {},
) {
  const [state, dispatch, pending] = useActionState<S | undefined, Payload>(async (prev, { fd, form }) => {
    const next = await action(prev, fd);
    if (opts.resetOn?.(next)) form.reset();
    opts.after?.(next);
    return next;
  }, undefined);
  const [transitioning, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter ?? undefined);
    startTransition(() => dispatch({ fd, form }));
  };
  return [state, onSubmit, pending || transitioning] as const;
}
