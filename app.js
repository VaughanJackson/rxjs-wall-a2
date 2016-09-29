import Rx from 'rx';
import pinyin from 'pinyin-browser';

/* Graphics */

const canvas = document.getElementById('stage');
const context = canvas.getContext('2d');
context.fillStyle = 'pink';

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

// https://www.frankmitchell.org/2015/01/fisher-yates/
// Fisher-Yates shuffle
function shuffle (array) {
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

const VOCAB = [...'的一是不了在人' +
              '有我他这个们中' +
              '来上大为和国地' +
              '到以说时要就出' +
              '会可也你对生能'];

function drawTitle() {
    context.textAlign = 'center';
    context.font = '24px Courier New';
    context.fillText('rxjs wall', canvas.width / 2, canvas.height / 2 - 24);
}

function drawControls() {
    context.textAlign = 'center';
    context.font = '16px Courier New';
    context.fillText('press [<] and [>] to play', canvas.width / 2, canvas.height / 2);
}

function drawGameOver(text) {
    context.clearRect(canvas.width / 4, canvas.height / 3, canvas.width / 2, canvas.height / 3);
    context.textAlign = 'center';
    context.font = '24px Courier New';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
}

function drawAuthor() {
    context.textAlign = 'center';
    context.font = '16px Courier New';
    context.fillText('Based on rxjs-breakout by Manuel Wieser',
                     canvas.width / 2,
                     canvas.height / 2 + 24);
}

function drawScore(score) {
    context.textAlign = 'left';
    context.font = '16px Courier New';
    context.fillText(score, BRICK_GAP, 16);
}

function drawPaddle(position) {
    context.beginPath();
    context.rect(
        position - PADDLE_WIDTH / 2,
        context.canvas.height - PADDLE_HEIGHT - PADDLE_OFFSET_FROM_FLOOR,
        PADDLE_WIDTH,
        PADDLE_HEIGHT
    );
    context.fill();
    context.closePath();
}

function drawBall(ball) {
    context.beginPath();
    context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.closePath();
}

function drawBrick(brick) {
    context.beginPath();
    context.rect(
        brick.x - brick.width / 2,
        brick.y - brick.height / 2,
        brick.width,
        brick.height
    );
    if (!brick.ready) {
        context.stroke();
    }
    context.fillText(brick.character,
                     brick.x - BRICK_CHARACTER_OFFSET ,
                     brick.y + BRICK_CHARACTER_OFFSET);
    context.closePath();
}

// A tile displays a character's pinyin and when clicked on, makes the brick
// ready to evaporate - think of a suitable name for that state!
function drawTile(tile) {
    context.beginPath();
    context.rect(
        tile.x - tile.width / 2,
        tile.y - tile.height / 2,
        tile.width,
        tile.height
    );
    context.stroke();
    if (!tile.brick.ready) {
        context.fillText(tile.pinyin,
                         tile.x - TILE_PINYIN_OFFSET,
                         tile.y + BRICK_CHARACTER_OFFSET);
    }
    context.closePath();
}

function drawBricks(bricks) {
    bricks.forEach((brick) => {
        drawBrick(brick);
    });
}

function drawTiles(tiles) {
    tiles.forEach((tile) => {
        drawTile(tile);
    });
}


/* Sounds */

const audio = new (window.AudioContext || window.webkitAudioContext)();
const beeper = new Rx.Subject();
beeper.sample(100).subscribe((key) => {

    let oscillator = audio.createOscillator();
    oscillator.connect(audio.destination);
    oscillator.type = 'square';

    // https://en.wikipedia.org/wiki/Piano_key_frequencies
    oscillator.frequency.value = Math.pow(2, (key - 49) / 12) * 440;

    oscillator.start();
    oscillator.stop(audio.currentTime + 0.100);

});


/* Ticker */

const TICKER_INTERVAL = /*17*/100;

const ticker$ = Rx.Observable
    .interval(TICKER_INTERVAL, Rx.Scheduler.requestAnimationFrame)
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


/* Paddle */

const PADDLE_SPEED = 240;
const PADDLE_KEYS = {
    left: 37,
    right: 39
};

const input$ = Rx.Observable
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

  const mouseClicked$ = Rx.Observable.merge(
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

const paddle$ = ticker$
    .withLatestFrom(input$)
    .scan((position, [ticker, direction]) => {

        let next = position + direction * ticker.deltaTime * PADDLE_SPEED;
        return Math.max(Math.min(next, canvas.width - PADDLE_WIDTH / 2), PADDLE_WIDTH / 2);

    }, canvas.width / 2)
    .distinctUntilChanged();

/* Ball */

const BALL_SPEED = /*60*/15;
const INITIAL_OBJECTS = {
    ball: {
        position: {
            x: canvas.width / 2,
            y: canvas.height / 2
        },
        direction: {
            x: 2,
            y: 2
        }
    },
    bricks: brickFactory(),
    score: 0
};

INITIAL_OBJECTS.tiles = tileFactory(INITIAL_OBJECTS.bricks);

function hit(paddle, ball) {
    return ball.position.x > paddle - PADDLE_WIDTH / 2
        && ball.position.x < paddle + PADDLE_WIDTH / 2
        && ball.position.y > canvas.height - PADDLE_OFFSET_FROM_FLOOR - PADDLE_HEIGHT - BALL_RADIUS / 2;
}

const objects$ = ticker$
    .combineLatest(paddle$, mouseClicked$)
    .scan(({ball, bricks, tiles, collisions, score}, [ticker, paddle, mouseClicked]) => {

        var logMessage = 'object$ scan: mouseClicked = ' + mouseClicked;
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
            if (!collision(brick, ball)) {
                survivors.push(brick);
            }

            if(collision(brick, ball)) {
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

        collisions.paddle = hit(paddle, ball);

        if (ball.position.x < BALL_RADIUS ||
            ball.position.x > canvas.width - BALL_RADIUS) {
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


/* Bricks */

function brickFactory() {
    let width = (canvas.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS;
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

function collision(brick, ball) {
    return ball.position.x + ball.direction.x > brick.x - brick.width / 2
        && ball.position.x + ball.direction.x < brick.x + brick.width / 2
        && ball.position.y + ball.direction.y > brick.y - brick.height / 2
        && ball.position.y + ball.direction.y < brick.y + brick.height / 2;
}

function tileFactory(bricks) {
    let width = (canvas.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS;
    let tiles = [];
    let shuffled = [];

    bricks.forEach(brick => {
        shuffled.push(brick);
    })

    shuffle(shuffled);

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


/* Game */

drawTitle();
drawControls();
drawAuthor();

function update([ticker, paddle, objects, mouseClicked]) {

    var logMessage = 'update(): mouseClicked = ' + mouseClicked;
    if (mouseClicked !== null) {
                 logMessage += 'x = ' + mouseClicked.offsetX
                            + ' y = ' + mouseClicked.clientY;
    }
    console.log(logMessage);

    context.clearRect(0, 0, canvas.width, canvas.height);

    drawPaddle(paddle);
    drawBall(objects.ball);
    drawBricks(objects.bricks);
    drawTiles(objects.tiles);
    drawScore(objects.score);

    if (objects.ball.position.y > canvas.height - PADDLE_OFFSET_FROM_FLOOR - BALL_RADIUS) {
        beeper.onNext(28);
        drawGameOver('GAME OVER');
        game.dispose();
    }

    if (!objects.bricks.length) {
        beeper.onNext(52);
        drawGameOver('CONGRATULATIONS');
        game.dispose();
    }

    if (objects.collisions.paddle) beeper.onNext(40);
    if (objects.collisions.wall || objects.collisions.ceiling) beeper.onNext(45);
    if (objects.collisions.brick) beeper.onNext(47 + Math.floor(objects.ball.position.y % 12));

}

const game = Rx.Observable
    .combineLatest(ticker$, paddle$, objects$, mouseClicked$)
    .sample(TICKER_INTERVAL)
    .subscribe(update);
