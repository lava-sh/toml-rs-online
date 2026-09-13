import { createApp } from "vue";
import App from "./App.vue";
import { textFactory } from "./editors/text";
import "./styles.css";

createApp(App, { textFactory }).mount("#app");
