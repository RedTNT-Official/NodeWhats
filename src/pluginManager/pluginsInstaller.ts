import { Choice, enterToContinue, GoBack, logo, MainMenu, Menu } from "bot";
import { spinnerConfig } from "../app";
import { NpmPlugin } from "../Utils";
import Spinner from "../loading";

export async function pluginsMenu() {
    logo("Searching plugins...".cyan);
    Spinner.start(400, spinnerConfig);
    const availablePlugins = await NpmPlugin.search();

    Spinner.stop();
    const choices = availablePlugins.map((plugin) => new Choice(`${plugin.name.yellow} v${plugin.version.blue} ${plugin.installed ? "Installed".green : "Not installed".red}`));

    const option = await new Menu("Available Plugins:", "list", choices, () => {
        MainMenu.show(true);
    }).show(true);
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
            console.log(plugin.description?.cyan || "No description".red);
            await enterToContinue();
            logo();
            MainMenu.show();
        })
    ] : [
        new Choice("Search for Updates", async () => {
            logo();
            Spinner.start(400, spinnerConfig);
            const versions = await plugin.getVersions();
            const actual = NpmPlugin.getInstalled().find(p => p.fullname === plugin.fullname)?.version;
            const last = versions[versions.length - 1];
            
            Spinner.stop();
            
            if (!actual) {
                console.log("The plugin is installed locally. Please update it manually".red);
                await enterToContinue();
                return pluginsMenu();
            }
            if (actual === last) {
                logo("The plugin is up-to-date".green);
                await enterToContinue();
                pluginsMenu();
            } else {
                new Menu(`${plugin.name} versions`.yellow, "list", versions.map((v) => {
                    return new Choice(v, async () => {
                        await plugin.install(v);
                        await enterToContinue();
                        pluginsMenu();
                    });
                })).show();
            }
        }),
        new Choice("Uninstall", async () => {
            console.log(`Removing ${plugin.name}`.yellow);
            await plugin.uninstall();
            logo(`${plugin.name} removed`.green);
            await enterToContinue();
            pluginsMenu();
        })
    ]), () => {
        pluginsMenu();
    }).show(true);
}