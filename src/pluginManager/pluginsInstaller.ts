import { goBack, mainMenu } from "../index";
import { Interface, logo, NpmPlugin } from "../Utils";

export async function pluginsMenu() {
    const availablePlugins = await NpmPlugin.search();

    const choices = [
        ...availablePlugins.map((plugin, index) => {
            return {
                name: `${plugin.name.yellow} v${plugin.version.blue} ${plugin.installed ? "Installed".green : "Not installed".red}`,
                value: index + 1
            }
        }),
        {
            name: "Go Back",
            value: availablePlugins.length + 1
        }
    ]

    const option = await Interface("Available plugins:", choices);

    if (option === availablePlugins.length + 1) return mainMenu();
    const plugin = availablePlugins[option - 1];

    const actionList = (!plugin.installed) ? [
        {
            name: "Install",
            value: 1,
            cb: async () => {
                console.log(`Installing ${plugin.name.green}...`.magenta);
                await plugin.install();
                await goBack(`${plugin.name} installed`.green);
                pluginsMenu();
            }
        },
        {
            name: "Go back",
            value: 2,
            cb: async () => {
                logo("Searching plugins...".cyan);
                pluginsMenu();
            }
        }
    ] : [
        {
            name: "Search for updates",
            value: 1,
            cb: async () => {
                await goBack("Unavailable yet".red)
                pluginsMenu();
            }
        },
        {
            name: "Uninstall",
            value: 2,
            cb: async () => {
                console.log(`Removing ${plugin.name}`.yellow);
                await plugin.uninstall();
                goBack(`${plugin.name} removed`.green);
            }
        },
        {
            name: "Go back",
            value: 3,
            cb: () => {
                logo("Searching plugins...".cyan);
                pluginsMenu();
            }
        }
    ]

    const action = await Interface(plugin.name.yellow, actionList);

    actionList[action - 1].cb();
}