import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";
import { join } from "path";
import "colors";

const mainPath = join(process.cwd(), "plugins");

async function main(name: string) {
    if (name.trim().length === 0) return console.log("You must enter a name for the plugin".red);

    const path = join(mainPath, name);
    if (existsSync(path)) return console.log("The directory already exists".red);

    const packageJson = {
        name: `@redtnt/${name.replace(/ +/g, "-").toLowerCase()}`,
        version: "1.0.0",
        description: `The ${name} plugin!`,
        main: "index.js",
        scripts: {
            build: "tsc",
            prepare: "tsc || exit 0",
        },
        keywords: [],
        author: "",
        license: "ISC",
        whatsappBotPlugin: true,
        dependencies: {
            "bot": "file:../../src/api"
        },
        devDependencies: {
            "@types/node": "^18.14.0"
        }
    }

    await mkdir(path);
    await writeFile(join(path, "package.json"), JSON.stringify(packageJson, null, 2));
    await writeFile(join(path, "index.ts"),
`import { client } from "bot";

console.log("[${name}-plugin] Allocated".blue);

client.on("message", (msg) => {
    if (msg.fromMe) return console.log("Message sent!".green);

    console.log(\`Message recieved from \${msg.author.pushname}\`.yellow);
});`);
    await writeFile(join(path, ".npmignore"),
`/node_modules
/.vscode
*.ts
!*.d.ts`);
    await writeFile(join(path, "tsconfig.json"), JSON.stringify({
        "compilerOptions": {
            "target": "es2017",
            "lib": [
                "es2017"
            ],
            "module": "CommonJS",
            "skipLibCheck": true,
            "esModuleInterop": true,
            "moduleResolution": "Node",
            "alwaysStrict": true,
            "noImplicitAny": true,
            "strictNullChecks": true,
            "noImplicitThis": true,
            "resolveJsonModule": true,
            "inlineSourceMap": true,
            "importHelpers": true,
            "experimentalDecorators": true,
            "declaration": true
        }
    }))

    exec(`cd plugins/${name} && npm install`);
}

main(process.argv[2]);