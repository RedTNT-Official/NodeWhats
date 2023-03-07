import { Choice, GoBack, ListMenu, logo, MainMenu } from "../api/index";
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
    const option = await new ListMenu("Available Plugins:", choices, () => {
        logo();
        MainMenu.show();
    }).show();
    const plugin = availablePlugins[option];

    if (!plugin) return;

    new ListMenu(plugin.name.yellow, (!plugin.installed) ? [
        new Choice("Install", async () => {
            console.log(`Installing ${plugin.name.green}...`.magenta);
            await plugin.install();
            logo(`${plugin.name} installed`.green);
            await GoBack.show();
            pluginsMenu();
        }),
        new Choice("See Description", async () => {
            console.log("Work in progress".bgRed)
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
            GoBack.show();
        })
    ], () => {
        logo();
        pluginsMenu();
    }).show();
}