import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { KanbanBoard } from "../KanbanBoard";
import type { BoardColumn, BoardItem } from "../KanbanBoard";

interface TaskItem extends BoardItem {
  title: string;
}

const columns: BoardColumn[] = [
  { id: "todo", title: "Todo" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
];

const items: TaskItem[] = [
  { id: "task-1", columnId: "todo", title: "Write spec" },
  { id: "task-2", columnId: "doing", title: "Build UI" },
  { id: "task-3", columnId: "done", title: "Deploy" },
];

describe("KanbanBoard (generic primitive)", () => {
  it("renders one column per columns[] entry by title", () => {
    render(<KanbanBoard items={items} columns={columns} />);
    expect(screen.getByText("Todo")).toBeInTheDocument();
    expect(screen.getByText("Doing")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders each item inside its matching column subtree", () => {
    render(<KanbanBoard items={items} columns={columns} />);
    const todoColumn = screen.getByTestId("kanban-column-todo");
    const doingColumn = screen.getByTestId("kanban-column-doing");
    const doneColumn = screen.getByTestId("kanban-column-done");

    expect(within(todoColumn).getByTestId("kanban-card-task-1")).toBeInTheDocument();
    expect(within(doingColumn).getByTestId("kanban-card-task-2")).toBeInTheDocument();
    expect(within(doneColumn).getByTestId("kanban-card-task-3")).toBeInTheDocument();

    expect(within(todoColumn).queryByTestId("kanban-card-task-2")).not.toBeInTheDocument();
  });

  it("calls onMove(itemId, toColumnId) once when a card is dropped on a column", () => {
    const onMove = vi.fn();
    render(<KanbanBoard items={items} columns={columns} onMove={onMove} />);

    const card = screen.getByTestId("kanban-card-task-1");
    const targetColumn = screen.getByTestId("kanban-column-doing");

    // Simulate HTML5 drag & drop with a shared DataTransfer-lite store
    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (key: string, value: string) => {
        store[key] = value;
      },
      getData: (key: string) => store[key] ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(targetColumn, { dataTransfer });
    fireEvent.drop(targetColumn, { dataTransfer });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("task-1", "doing");
  });

  it("uses custom renderCard when provided", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        renderCard={(item) => <span>Custom::{(item as TaskItem).title}</span>}
      />
    );
    expect(screen.getByText("Custom::Write spec")).toBeInTheDocument();
    expect(screen.getByText("Custom::Build UI")).toBeInTheDocument();
    expect(screen.getByText("Custom::Deploy")).toBeInTheDocument();
  });
});
