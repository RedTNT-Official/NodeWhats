import { exec } from "child_process";

(async () => {
    await npmInstall(__dirname);
    import("./app");
})();

export function npmInstall(path: string): Promise<void> {
    return new Promise((resolve) => {
        exec(`cd ${path} && npm i`, async () => {
            resolve();
        });
    });
}