import { client, enterToContinue, logo, MainMenu } from "./api/index";
import { loadCommands, loadListeners, loadPlugins } from "./Utils";
import Spinner from "./loading";
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

client.on("authenticated", () => {
    Spinner.stop();
    logo("Authenticated!".green);
});

client.on("ready", async () => {
    client.isReady = true;
    await loadCommands();
    await loadPlugins();
    await enterToContinue();
    logo("Client ready!".green);
    MainMenu.show();
});

client.initialize();