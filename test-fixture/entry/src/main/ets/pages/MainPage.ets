import { DetailPage } from '../pages/DetailPage';

@Entry
@Component
struct MainPage {
  @State currentIndex: number = 0;
  @State detailData: string = '';

  build() {
    Column() {
      Text('Main Page')
        .fontSize(28)

      Button('Go to Detail')
        .onClick(() => {
          this.currentIndex++;
          this.detailData = `Detail ${this.currentIndex}`;
        })

      if (this.detailData.length > 0) {
        DetailPage({ data: this.detailData })
      }
    }
  }
}
