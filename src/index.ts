import { Interface, loadListeners, loadPlugins, logo, reloadPlugins } from "./Utils";
import { Client, LocalAuth } from "whatsapp-web.js";
import { createInterface } from "readline";
import "colors";
import { pluginsMenu } from "./pluginManager/pluginsInstaller";

export const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        headless: true
    }
});

loadListeners();
logo();

client.on("ready", async () => {
    client.isReady = true;
    await loadPlugins();
    await enterToContinue();
    mainMenu("Client ready!".green);
});

client.on("authenticated", () => {
    console.log("Authenticated!".green);
});

client.initialize();

export async function mainMenu(extra?: string) {
    const choices = [
        {
            name: "Search Plugins".yellow,
            value: 1,
            cb: () => {
                logo("Searching plugins...".cyan);
                pluginsMenu();
            }
        },
        {
            name: "Reload Plugins".yellow,
            value: 2,
            cb: async () => {
                logo();
                await reloadPlugins();
                await enterToContinue();
                mainMenu();
            }
        },
        {
            name: "About".yellow,
            value: 3,
            cb: async () => {
                await goBack("Not available yet".bgRed.cyan);
                mainMenu();
            }
        },
        {
            name: "Stop".yellow,
            value: 4,
            cb: async () => {
                logo("Turning off...".red);
                await client.destroy();
                process.exit();
            }
        }
    ]

    const option = await Interface("Main Menu", choices, extra);

    choices[option - 1].cb();
}

export async function goBack(extra?: string): Promise<void> {
    return new Promise(async (resolve) => {
        await Interface("Actions:", [{
            name: "Go Back",
            value: 1
        }], extra);
        resolve();
    });
}

function enterToContinue(): Promise<void> {
    return new Promise((resolve) => {
        console.log("\n");
        const input = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        input.question("Press enter to continue", () => {
            input.close();
            resolve();
        });
    });
}