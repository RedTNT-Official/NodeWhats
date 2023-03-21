import { Choice, enterToContinue, GoBack, logo, MainMenu, Menu } from "bot";
import { NpmPlugin } from "../Utils";
import Spinner from "../loading";

export async function pluginsMenu() {
    logo("Searching plugins...".cyan);
    Spinner.start(400, {
        hideCursor: true,
        clearChar: true,
        clearLine: true,
        doNotBlock: false
    });
    const availablePlugins = await NpmPlugin.search();

    Spinner.stop();
    const choices = availablePlugins.map((plugin) => new Choice(`${plugin.name.yellow} v${plugin.version.blue} ${plugin.installed ? "Installed".green : "Not installed".red}`));

    logo();
    const option = await new Menu("Available Plugins:", "list", choices, () => {
        logo();
        MainMenu.show();
    }).show();
    const plugin = availablePlugins[option];

    if (!plugin) return;

    new Menu(plugin.name.yellow, "list", ((!plugin.installed) ? [
        new Choice("Install", async () => {
            console.log(`Installing ${plugin.name.green}...`.magenta);
            await plugin.install();
            logo(`${plugin.name} installed`.green);
            await GoBack.show();
            pluginsMenu();
        }),
        new Choice("See Description", async () => {
            console.log("Work in progress".bgRed);
            await enterToContinue();
            logo();
            MainMenu.show();
        })
    ] : [
        new Choice("Search for Updated", async () => {
            logo("Unavailable yet".red);
            await GoBack.show();
            pluginsMenu();
        }),
        new Choice("Uninstall", async () => {
            console.log(`Removing ${plugin.name}`.yellow);
            await plugin.uninstall();
            logo(`${plugin.name} removed`.green);
            await enterToContinue();
            pluginsMenu();
        })
    ]), () => {
        logo();
        pluginsMenu();
    }).show();
}