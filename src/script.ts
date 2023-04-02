import { Command, CommandPermissionLevel } from "bot";

Command.register("eval", "Admin command", async (_user, msg, args) => {
    try {
        const response = await eval(`(async () => {
            ${args.join(" ")}
        })()`);
        msg.react("✅");
        msg.reply(`${response}`);
    } catch (e) {
        msg.react("❌")
        msg.reply(`${e}`);
    }
}, CommandPermissionLevel.Admin);