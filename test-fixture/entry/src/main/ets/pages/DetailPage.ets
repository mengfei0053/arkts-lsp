/**
 * A detail page demonstrating V2 decorators and cross-file references.
 */
@ComponentV2
struct DetailPage {
  @Param data: string = '';
  @Local counter: number = 0;
  @Event onComplete: () => void = () => {};

  @Computed
  get displayText(): string {
    return `${this.data} (${this.counter})`;
  }

  @Monitor('data')
  onDataChange() {
    console.log(`Data changed to: ${this.data}`);
  }

  build() {
    Column() {
      Text(this.displayText)
        .fontSize(24)

      Text(`Counter: ${this.counter}`)
        .fontSize(18)

      Button('Increment')
        .onClick(() => {
          this.counter++;
        })

      Button('Complete')
        .onClick(() => {
          this.onComplete();
        })
    }
    .padding(16)
  }
}
