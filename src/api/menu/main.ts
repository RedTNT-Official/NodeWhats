import { Choice, enterToContinue, logo, Menu } from ".";
import { PluginMenu } from "./plugins";
import { client } from "..";

export const MainMenu = new Menu("Main Menu", "list", [
    new Choice("Search Plugins", () => {
        PluginMenu();
    }),
    new Choice("Reload Plugins", async () => {
        const { loadCommands, loadPlugins } = await import("../../Utils");
        logo();
        await loadCommands();
        await loadPlugins();
        await enterToContinue();
        logo();
        MainMenu.show();
    }),
    new Choice("About", async () => {
        logo([
            `Made by: ${"RedTNT".cyan}`.yellow,
            `Discord: ${"RedTNT#0333".cyan}`.yellow,
            `GitHub: ${"https://github.com/RedTNT-Official".cyan}`.yellow
        ].join("\n"));
        await enterToContinue();
        logo();
        MainMenu.show();
    }),
    new Choice("Stop", async () => {
        logo("Turning off...".red);
        client.destroy();
        process.exit();
    })
]);