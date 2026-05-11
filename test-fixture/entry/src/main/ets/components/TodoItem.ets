/**
 * A reusable TodoItem component with cross-file props.
 */
@Component
export struct TodoItem {
  @Prop content: string = '';
  @Prop index: number = 0;
  @State isCompleted: boolean = false;
  @Link parentCount: number;

  private toggleComplete(): void {
    this.isCompleted = !this.isCompleted;
  }

  build() {
    Row() {
      Checkbox()
        .select(this.isCompleted)
        .onChange((value: boolean) => {
          this.isCompleted = value;
        })

      Text(this.content)
        .fontSize(16)
        .decoration({ type: this.isCompleted ? TextDecorationType.LineThrough : TextDecorationType.None })
        .layoutWeight(1)

      Text(`#${this.index}`)
        .fontSize(14)
        .fontColor(Color.Gray)
    }
    .padding(8)
  }
}
