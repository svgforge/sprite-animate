// Demo5 — Polka from a Photo.
//
// The markup of the card and the picture is in public/demo5.html, the
// controller in ./polka-photo. The card finds every element by id, so starting
// it is a single line.
//
// The chooser is a <jd-select> and it brings its own list; the card only fills
// its options and reads its value.
import "./jd-select";
import { mountPolkaPhoto } from "./polka-photo";

mountPolkaPhoto();
