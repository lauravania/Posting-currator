"use client";

const STATUSES = ["IDEA", "DRAFT", "READY_FOR_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED"];

export function QuickStatusForm({
  action,
  currentStatus,
}: {
  action: (formData: FormData) => Promise<void>;
  currentStatus: string;
}) {
  return (
    <form
      action={action}
      onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        name="status"
        defaultValue={currentStatus}
        className="font-sans text-xs border border-hairline bg-ivory px-2 py-1"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </form>
  );
}
