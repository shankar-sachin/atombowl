// Full-page Tutor: the same chat as the floating widget, shown inline.
import { mount } from "./tutor_widget.js";

const target = document.getElementById("tutorMount");
if (target) mount({ container: target });
