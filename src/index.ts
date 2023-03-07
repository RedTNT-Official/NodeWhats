import { client, enterToContinue, logo, MainMenu } from "./api/index";
import { loadListeners, loadPlugins } from "./Utils";
// @ts-ignore
import * as Spinner from "loading-spinner";
import "colors";

Spinner.setSequence(['|'.cyan, '/'.cyan, '—'.cyan, '\\'.cyan]);
Spinner.start(400, {
    hideCursor: true,
    clearChar: true,
    clearLine: true,
    doNotBlock: false
});

logo();

loadListeners();

client.on("ready", async () => {
    client.isReady = true;
    await loadPlugins();
    await enterToContinue();
    logo("Client ready!".green);
    MainMenu.show();
});

client.on("authenticated", () => {
    Spinner.stop();
    console.log("Authenticated!".green);
});

client.initialize();