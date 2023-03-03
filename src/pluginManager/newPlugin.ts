import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import "colors";

const mainPath = join(process.cwd(), "plugins");

async function main(name: string) {
    if (name.trim().length === 0) return console.error("You must enter a name for the plugin");
    const path = join(mainPath, name);
    if (existsSync(path)) return console.log("The directory already exists".red);
    const packageJson = {
        name: `@redtnt/${name.replace(/ +/g, "-").toLowerCase()}`,
        version: "1.0.0",
        description: "",
        main: "index.ts",
        keywords: [],
        author: "",
        license: "ISC",
        whatsappBotPlugin: true,
        scripts: {
            build: "tsc",
        },
        dependencies: {
            "whatsapp-web.js": "1.19.4"
        },
        devDependencies: {
          "@types/node": "^18.14.0"
        }
    }
    await mkdir(path);
    await writeFile(join(path, "package.json"), JSON.stringify(packageJson, null, 2));
    await writeFile(join(path, "index.ts"),
`import { Client } from "whatsapp-web.js";

export default function(client: Client) {
    console.log("[${name}-plugin] Allocated".blue);
}`);
}

main(process.argv[2]);