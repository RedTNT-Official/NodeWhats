import { loadCommands, loadListeners, loadPlugins } from "./Utils";
import { client, enterToContinue, logo, MainMenu } from "bot";
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

client.on("open", async () => {
    Spinner.stop();
    await loadCommands();
    await loadPlugins();
    await enterToContinue();
    logo("Client ready!".green);
    MainMenu.show();
});

client.start();