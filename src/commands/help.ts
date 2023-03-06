import { Command, prefix } from "../api/index";
import { CommandRegistry } from "../Utils";

Command.register("help", "Get the available commands", (_contact, msg, args) => {
    if (args.length > 0) {

        const response = "┌── Comandos\n |\n" + args.map((c) => {
            const command = Command.find(c);
            const description = (command) ? command.description : "No se encontró el comando";
            return ` | ${prefix}${(command?.name || c)} ${(command?.admin) ? "*(Admin)*" : ""}: ${description}`;
        }).join("\n");
        return msg.reply(response);
    };

    const response = "┌── Comandos\n |\n" + Array.from(CommandRegistry.values()).filter(c => !c.admin).map(c => " | " + prefix + c.name).join("\n");
    msg.reply(response);
});