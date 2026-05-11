/**
 * Common utility functions and builders for the app.
 */
import { formatTodoCount, DEFAULT_TODO_TEXT } from '../model/TodoModel';

@Builder
export function ListHeaderBuilder(title: string) {
  Column() {
    Text(title)
      .fontSize(20)
      .fontWeight(FontWeight.Bold)
    Divider()
  }
}

@Builder
export function EmptyStateBuilder(message: string) {
  Column() {
    Image($r('app.media.empty'))
      .width(120)
      .height(120)
      .opacity(0.4)
    Text(message)
      .fontSize(14)
      .fontColor(Color.Gray)
      .margin({ top: 8 })
  }
  .justifyContent(FlexAlign.Center)
  .width('100%')
  .height('100%')
}

export function validateInput(text: string): boolean {
  return text.trim().length > 0;
}

export const MAX_TODO_LENGTH: number = 200;

export class Logger {
  static log(message: string): void {
    console.log(`[TodoApp] ${message}`);
  }
}
