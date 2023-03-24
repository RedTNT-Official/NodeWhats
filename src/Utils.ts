import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { client, CommandRegistry, GoBack, MainMenu } from "bot";
import { exec } from "child_process";
import { join } from "path";

const pluginsPath = join(__dirname, "..", "plugins");
const mainJsonPath = join(__dirname, "..", "package.json");

if (!existsSync(pluginsPath)) mkdirSync(pluginsPath);

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
            exec(`cd ${join(__dirname, "..")} && npm r ${this.fullname}`, (err, out) => {
                if (err) return reject(err);

                resolve();
            });
        });
    }
}

export class NpmPlugin extends Plugin {
    data: PackageInfoJson;

    constructor(packJson: PackageInfoJson) {
        super(packJson);
        this.data = packJson;
    }

    get installed(): boolean {
        return Boolean(mainPackJson().dependencies[this.fullname]);
    }

    getVersions(): Promise<string[]> {
        return new Promise((resolve) => {
            exec(`npm view ${this.fullname} versions --json`, (err, out) => {
                const parsed: string | string[] = JSON.parse(out);
                resolve((typeof parsed === "string") ? [parsed] : parsed);
            });
        });
    }

    install(version?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            exec(`npm i ${this.fullname}${version ? `@${version}` : ""}`, (err, out) => {
                if (err) return reject(err);

                resolve();
            });
        });
    }

    unload() {
        try {
            execOnDirFiles(join(__dirname, "..", "node_modules", this.fullname), (file, path) => {
                if (!file.endsWith(".js")) return;

                delete require.cache[path];
            });
        } catch (e) {
            console.log(e);
        }
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
        const dependencies: Record<string, string> = mainPackJson().dependencies;

        return Object.entries(dependencies).filter((v) => {
            const path = join(__dirname, "..", "node_modules", v[0]);
            return v[0].startsWith("@redtnt") && existsSync(path) && !lstatSync(path).isSymbolicLink()
        }).map((v) => {
            const path = join(__dirname, "..", "node_modules", v[0], "package.json");
            const packJson = JSON.parse(readFileSync(path, "utf-8"));
            console.log(path);
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

    install() {
        const json = mainPackJson();
        json.dependencies[this.fullname] = `file:plugins/${this.dirname}`;
        writeFileSync(mainJsonPath, JSON.stringify(json, null, 2));
    }

    load(): Promise<void> {
        return new Promise(async (resolve) => {
            try {
                await import(this.fullname);
                resolve();
            } catch (e) {
                console.error(e);
                resolve();
            }
        });
    }

    unload() {
        try {
            execOnDirFiles(join(pluginsPath, this.dirname), (file, path) => {
                if (!file.endsWith(".js")) return;

                delete require.cache[path];
            });
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
    const npm = NpmPlugin.getInstalled();

    if (npm.length > 0) {
        console.log("=".repeat(30).magenta);
        console.log(`Loading NPM plugin${npm.length > 0 ? "s" : ""} (${npm.length} plugin${npm.length > 0 ? "s" : ""})`.cyan);
        console.log("=".repeat(30).magenta);


        for (const plugin of npm) {
            console.log(`Loading ${plugin.name}`.green);
            try {
                plugin.unload();
                await import(plugin.fullname);
            } catch (e) {
                console.error(e);
            }
        }
        console.log("\n");
    }

    const local = LocalPlugin.all();

    if (local.length > 0) {
        console.log("=".repeat(30).magenta);
        console.log(`Loading Local plugin${local.length > 0 ? "s" : ""} (${local.length} plugin${npm.length > 0 ? "s" : ""})`.cyan);
        console.log("=".repeat(30).magenta);

        for (const plugin of local) {
            if (!plugin.installed) {
                console.log(`[NodeWhats] ${plugin.name}: installing`.green);
                plugin.install();
                await npmInstall(join(__dirname, ".."));
            }
            plugin.unload();
            await npmInstall(join(pluginsPath, plugin.dirname));
            await plugin.load();
            console.log(`[NodeWhats] ${plugin.name}: loaded`.green);
        }
    }

    if (npm.length === 0 && local.length === 0) console.log("No plugins".cyan);
}

export async function loadListeners() {
    const listeners = readdirSync(join(__dirname, "listeners")).filter(f => f.endsWith(".js"));

    for (const listener of listeners) {
        try {
            delete require.cache[require.resolve(`./listeners/${listener}`)];
            require(`./listeners/${listener}`);
        } catch (e) {
            console.error(e)
        }
    }
}

export async function reloadPlugins() {
    client.removeAllListeners();
    MainMenu.resetChoices();
    GoBack.resetChoices();
    await loadListeners();
    await loadPlugins();
}

export async function loadCommands() {
    CommandRegistry.clear();
    const commands = readdirSync(join(__dirname, "commands")).filter(f => f.endsWith(".js"));

    for (const command of commands) {
        try {
            delete require.cache[require.resolve(`./commands/${command}`)];
            await import(`./commands/${command}`);
        } catch (e) {
            throw e;
        }
    }
}

function execOnDirFiles(path: string, cb: (fileName: string, filePath: string) => void) {
    const files = readdirSync(path).filter(f => f !== "node_modules");

    files.forEach((file) => {
        const filePath = join(path, file);

        if (statSync(filePath).isDirectory()) return execOnDirFiles(filePath, cb);

        cb(file, filePath);
    });
}

export function npmInstall(path: string): Promise<void> {
    return new Promise((resolve) => {
        exec(`cd ${path} && npm i`, async () => {
            resolve();
        });
    });
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