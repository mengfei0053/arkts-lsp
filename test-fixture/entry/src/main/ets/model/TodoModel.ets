/**
 * Observable model for reactive state management.
 */
@Observed
export class TodoModel {
  items: string[] = [];
  private nextId: number = 1;

  addItem(text: string): void {
    this.items.push(text);
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
  }

  clearAll(): void {
    this.items = [];
  }
}

export interface TodoItemData {
  id: number;
  text: string;
  completed: boolean;
}

export function formatTodoCount(count: number): string {
  return `${count} item${count !== 1 ? 's' : ''}`;
}

export const DEFAULT_TODO_TEXT: string = 'New Todo';
