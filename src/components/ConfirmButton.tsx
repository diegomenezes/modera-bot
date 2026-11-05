"use client";

export function ConfirmButton({
  action,
  message,
  label,
}: {
  action: () => Promise<void>;
  message: string;
  label: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      <button type="submit" className="btn btn-danger text-sm">
        {label}
      </button>
    </form>
  );
}
