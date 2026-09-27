// Demo3 — Pattern Studio.
//
// The markup of the control card is in public/demo3.html, the controller in
// ./pattern-studio. The studio finds every element by id, so starting it is a
// single line.
//
// The family chooser is a <jd-select>; importing it defines the element, and
// the page is free of the dropdown logic that used to be in here.
import "./jd-select";
import { mountPatternStudio } from "./pattern-studio";

mountPatternStudio();
