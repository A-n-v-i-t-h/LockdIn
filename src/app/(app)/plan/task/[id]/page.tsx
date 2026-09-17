import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getTask } from "@/lib/modules/tasks";
import { deleteTaskAction } from "@/app/actions/modules";
import { Header } from "@/components/Header";
import { EditTaskForm } from "./EditTaskForm";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTask(await getDb(), user.id, id);
  if (!task) notFound();
  return (
    <main id="main" className="scr">
      <Header chip="Task" />
      <div className="hd">
        <div className="eyebrow">Edit</div>
        <h1 className="h1">Task</h1>
      </div>
      <EditTaskForm task={task} />
      <form action={deleteTaskAction}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="back" value="/plan" />
        <button type="submit" className="btn ghost">
          Delete task
        </button>
      </form>
      <Link href="/plan" className="link">
        Back to plan
      </Link>
    </main>
  );
}
