import Link from "next/link";
import { toggleTaskAction } from "@/app/actions/modules";
import { fmt12h, fmtRelative } from "@/lib/time";
import { isOverdue, type Task } from "@/lib/modules/tasks";
import { Icon } from "./Icon";

export function taskMeta(t: Task, today: string): string {
  const parts: string[] = [];
  if (t.doneAt) parts.push("Done");
  else if (t.dueDate) {
    parts.push(isOverdue(t, today) ? `Overdue · ${fmtRelative(t.dueDate, today)}` : fmtRelative(t.dueDate, today));
    if (t.dueTime) parts.push(fmt12h(t.dueTime));
  } else parts.push("No date");
  return parts.join(" · ");
}

export function TaskRow({ task, today, edit = true }: { task: Task; today: string; edit?: boolean }) {
  const done = !!task.doneAt;
  return (
    <div className={`it${done ? " done" : ""}`}>
      <form action={toggleTaskAction}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="done" value={done ? "0" : "1"} />
        <button
          type="submit"
          className={`box${done ? " on" : ""}`}
          aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          aria-pressed={done}
        >
          {done ? <Icon name="check" size={16} stroke={3} /> : null}
        </button>
      </form>
      <div>
        <div className="tt">{task.title}</div>
        <div className={`meta${isOverdue(task, today) ? " bad" : ""}`}>{taskMeta(task, today)}</div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {task.priority !== "none" && !done ? <span className={`pri ${task.priority}`}>{task.priority}</span> : null}
        {edit ? (
          <Link href={`/plan/task/${task.id}`} className="iconbtn" aria-label={`Edit “${task.title}”`} style={{ width: 34, height: 34 }}>
            <Icon name="edit" size={16} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
