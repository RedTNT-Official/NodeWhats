import { loadCommands, loadListeners, loadPlugins } from "./Utils";
import { enterToContinue, logo, MainMenu } from "bot/menu";
import { client } from "bot";
import Spinner from "./loading";
import "colors";

export const spinnerConfig = {
    hideCursor: true,
    clearChar: true,
    clearLine: true,
    doNotBlock: false
}

Spinner.setSequence(['|'.cyan, '/'.cyan, '—'.cyan, '\\'.cyan]);
Spinner.start(400, spinnerConfig);

logo();
loadListeners();

client.on("open", async () => {
    Spinner.stop();
    await loadCommands();
    await loadPlugins();
    require("./script");
    const response = await enterToContinue();
    if (response === "noterminal") client.terminal = false;
    logo("Client ready!".green);
    MainMenu.show();
});

client.start();