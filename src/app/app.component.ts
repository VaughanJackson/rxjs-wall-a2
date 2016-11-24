import { Component, ElementRef, OnInit } from '@angular/core';
import * as pinyin from 'pinyin-browser';
import * as Rx from 'rxjs/Rx';

const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const PADDLE_OFFSET_FROM_FLOOR = 160;
const TILE_OFFSET_FROM_CEILING = 300;

const BALL_RADIUS = 10;

const BRICK_ROWS = 5;
const BRICK_COLUMNS = 7;
const BRICK_HEIGHT = 20;
const BRICK_GAP = 3;
const BRICK_CHARACTER_OFFSET = 6;

const TILE_PINYIN_OFFSET = 18;

/* TODO Do I need to make this an array before I can use it? */
const VOCAB = '的一是不了在人' +
              '有我他这个们中' +
              '来上大为和国地' +
              '到以说时要就出' +
              '会可也你对生能';

const TICKER_INTERVAL = /*17*/100;

/* Paddle */

const PADDLE_SPEED = 240;
const PADDLE_KEYS = {
    left: 37,
    right: 39
};


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

    /*private title = 'app works!: pinyin(汉语) = ' +
        pinyin('汉语') +
        "pinyin.compare('语', '语') = " + pinyin.compare('语', '语');*/

     // Canvas dimensions.
     // TODO This doesn't change the canvas dimensions until after
     // ngOnOnit() has triggered - which means initial calculations based
     // canvas dimensions go wrong...
     private readonly width: number = 480;
     private readonly height: number = 480;

     // Our canvas.
     private canvas: HTMLCanvasElement;

     // Context.
     private context: CanvasRenderingContext2D;

     private ball: any;//{ position: { x: 100, y: 100} };

     private position: number;

     // ElementRef - Deprecated(?), insecure(?) way of accessing the DOM.
     // But it works...
     constructor(private el: ElementRef) {}

     private audioContext: AudioContext;

     // TODO Can we be more type specific?
     //private beeper = new Rx.Subject<number>();
     private beeper: Rx.Subject<any>; // was just any

     // TODO Can we be more type specific?
     private ticker$: Rx.Observable<{ time: number; deltaTime: any; }>;
     private input$: Rx.Observable<any>;
     private mouseClicked$: Rx.Observable<any>;
     private paddle$: any;
     private objects$: any;
     private game: any;

     ngOnInit() {
         this.canvas = this.el.nativeElement.querySelector('canvas');
         this.context = this.canvas.getContext('2d');
         // TODO Why doesn't this set the fill style?
         this.context.fillStyle = 'pink';

         this.position = 50;

         /* Sounds */

         this.audioContext = new AudioContext();

         // TODO This subscription causes error_handler.js:51 TypeError: unknown type returned
         this.beeper = new Rx.Subject();
         this.beeper.sample(Rx.Observable.interval(100)).subscribe((key : number) => {
             const audio = this.audioContext;

             let oscillator = audio.createOscillator();
             oscillator.connect(audio.destination);
             oscillator.type = 'square';

             // https://en.wikipedia.org/wiki/Piano_key_frequencies
             oscillator.frequency.value = Math.pow(2, (key - 49) / 12) * 440;

             oscillator.start();
             oscillator.stop(audio.currentTime + 0.100);

         }
       );

       /* Ticker */

       this.ticker$ = Rx.Observable
       .interval(TICKER_INTERVAL, Rx.Scheduler.async)
       .map(() => ({
           time: Date.now(),
           deltaTime: null
       }))
       .scan(
           (previous, current) => ({
               time: current.time,
               deltaTime: (current.time - previous.time) / 1000
           })
       );

      this.input$ = Rx.Observable
      .merge(
          Rx.Observable.fromEvent(document, 'keydown', event => {
              switch (event.keyCode) {
                  case PADDLE_KEYS.left:
                      console.log('left');
                      return -1;
                  case PADDLE_KEYS.right:
                      console.log('right');
                      return 1;
                  default:
                      console.log('something else:' + event.keyCode);
                      return 0;
              }
          }),
          Rx.Observable.fromEvent(document, 'keyup', event => 0)
      )
      .distinctUntilChanged();

      this.mouseClicked$ = Rx.Observable.merge(
         Rx.Observable.fromEvent(document, 'mousedown', event => {
             console.log('m$ mouse down:' + event
                         + 'x = ' + event.offsetX
                         + ' y = ' + event.clientY);
             return event;
         }),
         Rx.Observable.fromEvent(document, 'mouseup', event => {
             console.log('m$ mouse up:' + event);
             return null;
         })
       );

     this.paddle$ = this.ticker$
         .withLatestFrom(this.input$)
         .scan((position, [ticker, direction]) => {

             let next = position + direction * ticker.deltaTime * PADDLE_SPEED;
             return Math.max(Math.min(next, this/*.canvas*/.width - PADDLE_WIDTH / 2), PADDLE_WIDTH / 2);

         }, this/*.canvas*/.width / 2)
         .distinctUntilChanged();

         /* Ball */

         const BALL_SPEED = /*60*/15;
         const INITIAL_OBJECTS = {
             ball: {
                 position: {
                     x: this/*.canvas*/.width / 2,
                     y: this/*.canvas*/.height / 2
                 },
                 direction: {
                     x: 2,
                     y: 2
                 }
             },
             bricks: this.brickFactory(),
             tiles: [],
             collisions: {
                 paddle: false,
                 floor: false,
                 wall: false,
                 ceiling: false,
                 brick: false
             },
             score: 0
         };

         INITIAL_OBJECTS.tiles = this.tileFactory(INITIAL_OBJECTS.bricks);

         this.objects$ = this.ticker$
             .combineLatest(this.paddle$, this.mouseClicked$)
             .scan(({ball, bricks, tiles, collisions, score}, [ticker, paddle, mouseClicked]) => {

                 let logMessage: String = 'object$ scan: mouseClicked = ' + mouseClicked;
                 if (mouseClicked !== null) {
                              logMessage += 'x = ' + mouseClicked.offsetX
                                         + ' y = ' + mouseClicked.clientY;
                     console.log(logMessage);
                     tiles.forEach(tile => {
                         if (tile.x - tile.width / 2 < mouseClicked.offsetX &&
                             mouseClicked.offsetX < tile.x + tile.width / 2 &&
                             tile.y - tile.height / 2 < mouseClicked.clientY &&
                              mouseClicked.clientY < tile.y + tile.height / 2) {
                                  console.log('Found it!:' + tile.pinyin + '=' + tile.brick.character);
                                  tile.brick.ready = true;
                         }
                     })
                 }

                 let survivors = [];
                 collisions = {
                     paddle: false,
                     floor: false,
                     wall: false,
                     ceiling: false,
                     brick: false
                 };

                 ball.position.x = ball.position.x + ball.direction.x * ticker.deltaTime * BALL_SPEED;
                 ball.position.y = ball.position.y + ball.direction.y * ticker.deltaTime * BALL_SPEED;

                 bricks.forEach((brick) => {
                     if (!this.collision(brick, ball)) {
                         survivors.push(brick);
                     }

                     if(this.collision(brick, ball)) {
                         collisions.brick = true;
                         if (brick.ready) {
                             console.log(brick.character + ' = ' + /*cjst.chineseToPinyin*/pinyin(brick.character));
                             score = score + 10;
                         } else {
                             console.log('brick ' + brick.character + 'not ready...');
                             survivors.push(brick);
                         }

                     }

                 });

                 collisions.paddle = this.hit(paddle, ball);

                 if (ball.position.x < BALL_RADIUS ||
                     ball.position.x > this/*.canvas*/.width - BALL_RADIUS) {
                     ball.direction.x = -ball.direction.x;
                     collisions.wall = true;
                 }

                 collisions.ceiling = ball.position.y < BALL_RADIUS;

                 if (collisions.brick || collisions.paddle || collisions.ceiling ) {
                     ball.direction.y = -ball.direction.y;
                 }

                 return {
                     ball: ball,
                     bricks: survivors,
                     tiles: tiles,
                     collisions: collisions,
                     score: score
                 };

             }, INITIAL_OBJECTS);

             /* Game */

             this.drawTitle();
             this.drawControls();
             this.drawAuthor();

             this.game = Rx.Observable
                 .combineLatest(this.ticker$, this.paddle$, this.objects$, this.mouseClicked$)
                 .sample(Rx.Observable.interval(TICKER_INTERVAL))
                 .subscribe( value => { /*console.log('called with ' + JSON.stringify(value));*/
                                        this.update(value);
                                      },
                             error => { console.log('error:' + error); },
                             () => { console.log('completed.'); } );

     }

  hit(paddle, ball) {
      return ball.position.x > paddle - PADDLE_WIDTH / 2
          && ball.position.x < paddle + PADDLE_WIDTH / 2
          && ball.position.y > this/*.canvas*/.height - PADDLE_OFFSET_FROM_FLOOR - PADDLE_HEIGHT - BALL_RADIUS / 2;
  }

  /* Bricks */

  brickFactory() {
      let width = (this.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS;
      let bricks = [];

      for (let i = 0; i < BRICK_ROWS; i++) {
          for (let j = 0; j < BRICK_COLUMNS; j++) {
              bricks.push({
                  x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
                  y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20,
                  width: width,
                  height: BRICK_HEIGHT,
                  character: VOCAB[i * BRICK_COLUMNS + j],
                  ready: false
              });
          }
      }

      return bricks;
  }

  collision(brick, ball) {
      return ball.position.x + ball.direction.x > brick.x - brick.width / 2
          && ball.position.x + ball.direction.x < brick.x + brick.width / 2
          && ball.position.y + ball.direction.y > brick.y - brick.height / 2
          && ball.position.y + ball.direction.y < brick.y + brick.height / 2;
  }

  /* Tiles */

  tileFactory(bricks) {
      let width = (this.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS;
      let tiles = [];
      let shuffled = [];

      bricks.forEach(brick => {
          shuffled.push(brick);
      })

      this.shuffle(shuffled);

      for (let i = 0; i < BRICK_ROWS; i++) {
          for (let j = 0; j < BRICK_COLUMNS; j++) {
              tiles.push({
                  x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
                  y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20 + TILE_OFFSET_FROM_CEILING,
                  width: width,
                  height: BRICK_HEIGHT,
                  brick: shuffled[i * BRICK_COLUMNS + j],
                  pinyin: pinyin(shuffled[i * BRICK_COLUMNS + j].character)
              });
          }
      }

      return tiles;
  }

  // https://www.frankmitchell.org/2015/01/fisher-yates/
  // Fisher-Yates shuffle
  shuffle (array) {
    var i = 0
      , j = 0
      , temp = null

    for (i = array.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1))
      temp = array[i]
      array[i] = array[j]
      array[j] = temp
    }
  }

  drawTitle() {
      this.context.textAlign = 'center';
      this.context.font = '24px Courier New';
      this.context.fillText('rxjs wall', this/*.canvas*/.width / 2, this/*.canvas*/.height / 2 - 24);
  }

  drawControls() {
      this.context.textAlign = 'center';
      this.context.font = '16px Courier New';
      this.context.fillText('press [<] and [>] to play', this/*.canvas*/.width / 2, this/*.canvas*/.height / 2);
  }

  drawGameOver(text) {
      this.context.clearRect(this/*.canvas*/.width / 4, this/*.canvas*/.height / 3, this/*.canvas*/.width / 2, this/*.canvas*/.height / 3);
      this.context.textAlign = 'center';
      this.context.font = '24px Courier New';
      this.context.fillText(text, this/*.canvas*/.width / 2, this/*.canvas*/.height / 2);
  }

  drawAuthor() {
      this.context.textAlign = 'center';
      this.context.font = '16px Courier New';
      this.context.fillText('Based on rxjs-breakout by Manuel Wieser',
                            this/*.canvas*/.width / 2,
                            this/*.canvas*/.height / 2 + 24);
  }

  drawScore(score) {
      this.context.textAlign = 'left';
      this.context.font = '16px Courier New';
      this.context.fillText(score, BRICK_GAP, 16);
  }

  drawPaddle(position) {
      this.context.beginPath();
      this.context.rect(
          position - PADDLE_WIDTH / 2,
          this.context.canvas.height - PADDLE_HEIGHT - PADDLE_OFFSET_FROM_FLOOR,
          PADDLE_WIDTH,
          PADDLE_HEIGHT
      );
      this.context.fill();
      this.context.closePath();
  }

  drawBall(ball) {
      this.context.beginPath();
      this.context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
      this.context.fill();
      this.context.closePath();
  }

  drawBrick(brick) {
      this.context.beginPath();
      this.context.rect(
          brick.x - brick.width / 2,
          brick.y - brick.height / 2,
          brick.width,
          brick.height
      );
      if (!brick.ready) {
          this.context.stroke();
      }
      this.context.fillText(brick.character,
                            brick.x - BRICK_CHARACTER_OFFSET ,
                            brick.y + BRICK_CHARACTER_OFFSET);
      this.context.closePath();
  }

  // A tile displays a character's pinyin and when clicked on, makes the brick
  // ready to evaporate - think of a suitable name for that state!
  drawTile(tile) {
      this.context.beginPath();
      this.context.rect(
          tile.x - tile.width / 2,
          tile.y - tile.height / 2,
          tile.width,
          tile.height
      );
      this.context.stroke();
      if (!tile.brick.ready) {
          this.context.fillText(tile.pinyin,
                                tile.x - TILE_PINYIN_OFFSET,
                                tile.y + BRICK_CHARACTER_OFFSET);
      }
      this.context.closePath();
  }

  drawBricks(bricks) {
      bricks.forEach((brick) => {
          this.drawBrick(brick);
      });
  }

  drawTiles(tiles) {
      tiles.forEach((tile) => {
          this.drawTile(tile);
      });
  }

  update([ticker, paddle, objects, mouseClicked]) {

      console.log('update(' + ticker + ',' + paddle + ', ' + objects + ', ' + mouseClicked + ')');

      let logMessage: String = '): mouseClicked = ' + mouseClicked;
      if (mouseClicked !== null) {
                   logMessage += 'x = ' + mouseClicked.offsetX
                              + ' y = ' + mouseClicked.clientY;
      }
      console.log(logMessage);

      this.context.clearRect(0, 0, this/*.canvas*/.width, this/*.canvas*/.height);

      this.drawPaddle(paddle);
      this.drawBall(objects.ball);
      this.drawBricks(objects.bricks);
      this.drawTiles(objects.tiles);
      this.drawScore(objects.score);

      if (objects.ball.position.y > this/*.canvas*/.height - PADDLE_OFFSET_FROM_FLOOR - BALL_RADIUS) {
          this.beeper.next(28);
          this.drawGameOver('GAME OVER');
          this.game.unsubscribe();
      }

      if (!objects.bricks.length) {
          this.beeper.next(52);
          this.drawGameOver('CONGRATULATIONS');
          this.game.unsubscribe();
      }

      if (objects.collisions.paddle) this.beeper.next(40);
      if (objects.collisions.wall || objects.collisions.ceiling) this.beeper.next(45);
      if (objects.collisions.brick) this.beeper.next(47 + Math.floor(objects.ball.position.y % 12));

  }

}
