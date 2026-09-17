"use client";

import { useFormSubmit } from "@/components/useFormSubmit";
import { loginAction, type FormState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, onSubmit, pending] = useFormSubmit<FormState>(loginAction);
  return (
    <form onSubmit={onSubmit} className="card" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" autoComplete="username" inputMode="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
