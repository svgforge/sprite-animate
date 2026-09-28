// Demo4 — endless morph.
//
// The page holds a toolbar with a play button and a slider for the speed, and a
// large square stage with one path in it. Two shapes are generated up front, so
// the stage starts moving at once. Every shape brings its own colour, and the
// morph into the next shape runs slowly — while it runs, the shape after it is
// already generated and waits. The stage therefore keeps moving, without a break
// between two shapes, until the play button is pressed again.
import { gsap } from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { randomPath } from "./random-path";

// Register once, so gsap.to(..., { morphSVG }) works below.
gsap.registerPlugin(MorphSVGPlugin);

/** How long a morph takes, until the slider says otherwise. */
const MORPH_SECONDS = 4;

/** The colours a shape can get — all bright, so each one shows up on the dark stage. */
const FILLS = [
  "#00d4ff", // cyan
  "#6b8cff", // blue
  "#b28dff", // violet
  "#ff8fab", // pink
  "#ff6b6b", // red
  "#ffb457", // orange
  "#ffd166", // yellow
  "#7bed9f", // green
];

/**
 * Picks one of the fills at random.
 *
 * @returns The colour as a hex string.
 */
function randomFill(): string {
  const fill = FILLS[Math.floor(Math.random() * FILLS.length)];
  return fill ?? FILLS[0];
}

/** The parts of the page the driver works with. */
interface Stage {
  /** The play/pause button. */
  button: HTMLButtonElement;
  /** The one path the whole cycle morphs in. */
  path: SVGPathElement;
  /** The note that invites to press play, while nothing is moving. */
  hint: HTMLElement | null;
  /** The slider that sets how long a morph takes. */
  speed: HTMLInputElement | null;
  /** The readout next to the slider. */
  speedValue: HTMLOutputElement | null;
}

/**
 * Drives the play button, the speed slider and the endless morph in the stage.
 */
class EndlessMorph {
  private readonly button: HTMLButtonElement;
  private readonly path: SVGPathElement;
  private readonly hint: HTMLElement | null;
  private readonly speedValue: HTMLOutputElement | null;

  /** The morph that is running, or `null` while the stage stands still. */
  private tween: gsap.core.Tween | null = null;

  /** The shape the next morph goes to, and the colour it arrives in. */
  private queued = "";
  private queuedFill = "";

  /** How long a morph takes, in seconds. The slider has the last word. */
  private seconds = MORPH_SECONDS;

  private playing = false;

  constructor(parts: Stage) {
    this.button = parts.button;
    this.path = parts.path;
    this.hint = parts.hint;
    this.speedValue = parts.speedValue;
    this.button.addEventListener("click", () => {
      if (this.playing) this.pause();
      else this.play();
    });
    // The slider position is the first duration, so its readout is filled in
    // from it right away.
    const { speed } = parts;
    speed?.addEventListener("input", () => this.setSeconds(Number(speed.value)));
    this.setSeconds(Number(speed?.value ?? MORPH_SECONDS));
    this.showState();
  }

  private play(): void {
    this.playing = true;
    // The stage is empty until the first shape is drawn. After a pause it holds
    // the shape the interrupted morph got to, and that one is kept.
    if (!this.path.getAttribute("d")) {
      this.path.setAttribute("d", randomPath());
      this.path.setAttribute("fill", randomFill());
    }
    // The second shape waits for its morph before it starts, so the stage moves
    // right away instead of standing still first.
    this.queued = randomPath();
    this.queuedFill = randomFill();
    this.showState();
    this.morph();
  }

  private pause(): void {
    this.playing = false;
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    this.showState();
  }

  private morph(): void {
    if (!this.playing) return;
    // What this morph goes to, taken from the queue that was filled while the
    // last one ran.
    const target = this.queued;
    const targetFill = this.queuedFill;
    // The next shape and colour are generated while this morph runs, so they are
    // ready when it ends.
    this.queued = randomPath();
    this.queuedFill = randomFill();
    // MorphSVGPlugin tweens the d attribute of the path from where it stands to
    // the target shape, so the shape on the stage is the animation's own state.
    // The colour rides in the same tween, which is why the shape and its colour
    // always arrive together and the slider covers both at once.
    this.tween = gsap.to(this.path, {
      morphSVG: {
        shape: target,
        // Rotational tries to turn the points into each other, which reads more
        // organically than the simple point-by-point match.
        type: "rotational",
      },
      fill: targetFill,
      duration: this.seconds,
      ease: "sine.inOut",
      onComplete: () => {
        this.tween = null;
        this.morph();
      },
    });
  }

  /** Takes over the speed slider: the next and the running morph follow it. */
  private setSeconds(value: number): void {
    this.seconds = value;
    if (this.speedValue) this.speedValue.value = `${value} s`;
    // A morph that is already running keeps its place and goes on at the new
    // speed, instead of starting over.
    if (this.tween) this.tween.duration(value);
  }

  /** Tells the button and the stage which state the animation is in. */
  private showState(): void {
    this.button.dataset.state = this.playing ? "pause" : "play";
    this.button.setAttribute("aria-label", this.playing ? "Pause the morph" : "Play the morph");
    if (this.hint) this.hint.hidden = this.playing;
  }
}

/**
 * Starts the demo: finds the button, the slider and the stage, and hands them
 * to the driver.
 */
function mountEndlessMorph(): void {
  const button = document.querySelector<HTMLButtonElement>("#morph-toggle");
  const path = document.querySelector<SVGPathElement>("#morph-path");
  if (!button || !path) return;
  new EndlessMorph({
    button,
    path,
    hint: document.querySelector<HTMLElement>("#stage-hint"),
    speed: document.querySelector<HTMLInputElement>("#morph-speed"),
    speedValue: document.querySelector<HTMLOutputElement>("#morph-speed-value"),
  });
}

mountEndlessMorph();
