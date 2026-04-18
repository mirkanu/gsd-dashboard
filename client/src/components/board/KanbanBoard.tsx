import type { ReactNode, DragEvent } from "react";

/**
 * Generic, presentational Kanban board primitive.
 *
 * Parked for Phase 61 reuse. Has no agent-specific logic, no data fetching,
 * no WebSocket subscription, and no authentication context — callers supply
 * the items, columns, and (optionally) a custom card renderer + move handler.
 */

export interface BoardColumn {
  id: string;
  title: string;
}

export interface BoardItem {
  id: string;
  columnId: string;
}

export interface KanbanBoardProps<T extends BoardItem> {
  items: T[];
  columns: BoardColumn[];
  onMove?: (itemId: string, toColumnId: string) => void;
  renderCard?: (item: T) => ReactNode;
}

const DRAG_MIME = "text/plain";

export function KanbanBoard<T extends BoardItem>({
  items,
  columns,
  onMove,
  renderCard,
}: KanbanBoardProps<T>): JSX.Element {
  const handleDragStart = (itemId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(DRAG_MIME, itemId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (columnId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData(DRAG_MIME);
    if (itemId && onMove) {
      onMove(itemId, columnId);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto" data-testid="kanban-board">
      {columns.map((column) => {
        const columnItems = items.filter((i) => i.columnId === column.id);
        return (
          <div
            key={column.id}
            data-testid={`kanban-column-${column.id}`}
            className="bg-gray-900 rounded p-3 flex flex-col flex-shrink-0 w-72"
            onDragOver={handleDragOver}
            onDrop={handleDrop(column.id)}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              {column.title}
            </div>
            <div className="flex-1 space-y-2">
              {columnItems.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={handleDragStart(item.id)}
                  data-testid={`kanban-card-${item.id}`}
                >
                  {renderCard ? (
                    renderCard(item)
                  ) : (
                    <div className="p-2 bg-gray-800 rounded mb-2">{item.id}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
