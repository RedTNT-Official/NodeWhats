import { existsSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "fs";
import { client } from "./index";
import { exec } from "child_process";
import { join } from "path";

const pluginsPath = join(process.cwd(), "plugins");
const mainJsonPath = join(process.cwd(), "package.json");

class Plugin {
    name: string;
    fullname: string;
    description?: string
    version: string;

    constructor(packJson: { name: string; description?: string; version: string; }) {
        this.name = packJson.name.split("/")[1];
        this.fullname = packJson.name;
        this.description = packJson.description;
        this.version = packJson.version;
    }

    uninstall(): Promise<void> {
        return new Promise((resolve, reject) => {
            exec(`npm r ${this.fullname}`, (err, out) => {
                if (err) return reject(err);

                resolve();
            });
        });
    }
}

export class NpmPlugin extends Plugin {

    constructor(packJson: PackageInfoJson) {
        super(packJson);
    }

    get installed(): boolean {
        return Boolean(mainPackJson().dependencies[this.fullname]);
    }

    install(): Promise<void> {
        return new Promise((resolve, reject) => {
            exec(`npm i ${this.fullname}`, (err, out) => {
                if (err) return reject(err);

                resolve();
            });
        });
    }

    static search(): Promise<NpmPlugin[]> {
        return new Promise((resolve, reject) => {
            exec('npm search --json "@redtnt" --searchlimit=50', (err, out) => {
                if (err) return reject(err);

                const response: PackageInfoJson[] = JSON.parse(out);
                resolve(response.map((p) => new NpmPlugin(p)));
            });
        });
    }

    static getInstalled(): NpmPlugin[] {
        const dependencies: Record<string, string> = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")).dependencies;

        return Object.entries(dependencies).filter((v) => v[0].startsWith("@redtnt")).map((v) => {
            const path = join(process.cwd(), "node_modules", v[0], "package.json");
            const packJson = JSON.parse(readFileSync(path, "utf-8"));
            return new NpmPlugin(packJson);
        });
    }
}

export class LocalPlugin extends Plugin {
    dirname: string;
    packageJson: PackageJson;

    constructor(packJson: PackageJson, dirname: string) {
        super(packJson);
        this.packageJson = packJson;
        this.dirname = dirname;
    }

    get installed(): boolean {
        return Boolean(mainPackJson().dependencies[this.fullname]);
    }

    load() {
        try {
            require(`../plugins/${this.dirname}`).default?.(client);
        } catch (e) {
            console.log(e);
        }
    }

    unload() {
        try {
            delete require.cache[require.resolve(`../plugins/${this.dirname}`)];
        } catch (e) {
            console.log(e);
        }
    }

    static getPackage(path: string): PackageJson | null {
        const jsonPath = join(path, "package.json");
        return (existsSync(jsonPath)) ? JSON.parse(readFileSync(jsonPath, "utf-8")) : null;
    }

    static all(): LocalPlugin[] {
        const directories = readdirSync(pluginsPath).filter(p => {
            const path = join(pluginsPath, p);
            const packJson = LocalPlugin.getPackage(path);
            return statSync(path).isDirectory() && packJson && packJson.whatsappBotPlugin;
        });

        return directories.map((v) => new LocalPlugin(LocalPlugin.getPackage(join(pluginsPath, v))!, v));
    }
}

function mainPackJson(): PackageJson {
    return JSON.parse(readFileSync(mainJsonPath, "utf-8"));
}

export async function loadPlugins() {
    //installPlugins();

    const npm = NpmPlugin.getInstalled();

    if (npm.length > 0) {
        console.log("=".repeat(30).magenta);
        console.log(`Loading NPM plugin${npm.length > 0 ? "s" : ""} (${npm.length} plugin${npm.length > 0 ? "s" : ""})`.cyan);
        console.log("=".repeat(30).magenta);

        npm.forEach((plugin) => {
            console.log(`Loading ${plugin.name}`.green);
            try {
                require(plugin.fullname).default(client);
            } catch (e) {
                throw e
            }
        });
        console.log("\n");
    }

    const local = LocalPlugin.all();

    if (local.length > 0) {
        console.log("=".repeat(30).magenta);
        console.log(`Loading Local plugin${local.length > 0 ? "s" : ""} (${local.length} plugin${npm.length > 0 ? "s" : ""})`.cyan);
        console.log("=".repeat(30).magenta);

        local.forEach((plugin) => {
            console.log(`Loading ${plugin.name}`.green);
            plugin.load();
        });
    }

    if (npm.length === 0 && local.length === 0) console.log("No plugins".cyan);
}

export async function loadListeners() {
    const listeners = readdirSync(join(__dirname, "listeners")).filter(f => f.endsWith(".ts"));

    for (const listener of listeners) {
        try {
            require(`./listeners/${listener}`);
            //console.log(`Loading ${plugin.name} v${plugin.version}`.green);
        } catch (e) {
            console.error(e)
        }
    }
}

// function installPlugins() {
//     const plugins = LocalPlugin.all();

//     for (const plugin of plugins) {
//         if (plugin.installed) continue;

//         if (!plugin.packageJson.whatsappBotPlugin) {
//             console.log(`${plugin.dirname} is not a plugin`.red);
//             continue;
//         }

//         if (plugin.fullname.split("/")[0] !== "@redtnt") {
//             console.error(`Plugins must start with "@redtnt"`.red);
//             continue;
//         }

//         plugin.install();
//         console.log(`${plugin.name} plugin installed`.green);
//     }
// }

export async function reloadPlugins() {
    client.removeAllListeners();
    LocalPlugin.all().forEach(p => p.unload());
    await loadPlugins();
}

export function logo(extra?: string) {
    console.clear();
    console.log([
        "___  ___      _ _   _______       _         ___              ",
        "|  \\/  |     | | | (_) ___ \\     | |       / _ \\             ",
        "| .  . |_   _| | |_ _| |_/ / ___ | |_ ___ / /_\\ \\_ __  _ __  ",
        "| |\\/| | | | | | __| | ___ \\/ _ \\| __/ __||  _  | '_ \\| '_ \\ ",
        "| |  | | |_| | | |_| | |_/ / (_) | |_\\__ \\| | | | |_) | |_) |",
        "\\_|  |_/\\__,_|_|\\__|_\\____/ \\___/ \\__|___/\\_| |_/ .__/| .__/ ",
        "                                                | |   | |    ",
        "                                                |_|   |_|    "
    ].join("\n").red);

    if (extra) console.log(extra);
}

export async function Interface(title: string, choices: { value: number; name: string, cb?: () => void }[], extra?: string): Promise<number> {
    const inquirer = await import("inquirer");

    logo(extra);
    console.log("=".repeat(25).green);
    console.log("Select an option".magenta);
    console.log("=".repeat(25).green);

    const { option } = await inquirer.default.prompt([
        {
            type: "list",
            name: "option",
            message: title,
            choices: choices
        }
    ]);

    return option;
}

interface PackageInfoJson {
    name: string;
    scope: string;
    version: string;
    description?: string;
    date: string;
    links: {
        npm: string;
    };
    author?: {
        name: string;
        email: string;
        url: string;
    };
    publisher: {
        username: string;
        email: string;
    };
    maintainers: {
        username: string;
        email: string;
    }[];
}

interface PackageJson {
    name: string;
    version: string;
    description: string;
    main: string;
    scripts: Record<string, string>;
    whatsappBotPlugin?: boolean;
    keywords: string[];
    author: string;
    licence: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

declare module "whatsapp-web.js" {
    interface Client {
        isReady: boolean;
    }
}