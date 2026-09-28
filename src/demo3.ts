// Demo3 — Pattern Studio.
//
// The markup of the control card is in public/demo3.html, the controller in
// ./pattern-studio. The studio finds every element by id, so starting it is a
// single line.
//
// The family chooser is a <jd-select> and the saved patterns are a
// <pattern-tiles>; importing them defines the elements, and the page is free of
// the dropdown and tile logic that used to be in here.
import "./jd-select";
import "./pattern-tiles";
import { mountPatternStudio } from "./pattern-studio";

mountPatternStudio();
