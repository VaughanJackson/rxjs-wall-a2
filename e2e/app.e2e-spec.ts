import { RxjsWallA2Page } from './app.po';

describe('rxjs-wall-a2 App', function() {
  let page: RxjsWallA2Page;

  beforeEach(() => {
    page = new RxjsWallA2Page();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
