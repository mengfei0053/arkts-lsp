import { TodoModel } from '../model/TodoModel';
import { TodoItem } from '../components/TodoItem';

@Entry
@Component
struct Index {
  @State message: string = 'Hello HarmonyOS';
  @Prop title: string = '';
  @Link linkedCount: number;
  @Provide todoModel: TodoModel = new TodoModel();
  @Consume theme: string;

  @Builder
  HeaderBuilder() {
    Text(this.title)
      .fontSize(24)
      .fontWeight(FontWeight.Bold)
  }

  @BuilderParam footerContent: () => void;

  aboutToAppear() {
    this.message = 'App ready';
    console.log(`Theme: ${this.theme}`);
  }

  build() {
    Column() {
      this.HeaderBuilder()

      Text(this.message)
        .fontSize(20)
        .margin({ top: 16 })

      List() {
        ForEach(this.todoModel.items, (item: string, index: number) => {
          ListItem() {
            TodoItem({ content: item, index: index, parentCount: $linkedCount })
          }
        })
      }
      .layoutWeight(1)

      if (this.footerContent) {
        this.footerContent()
      }

      Button('Add Todo')
        .onClick(() => {
          this.todoModel.addItem(`Task ${this.linkedCount}`);
          this.linkedCount++;
        })
    }
    .padding(16)
  }
}
