import { client, CommandRegistry, prefix } from "bot";
import { Message } from "bot/socket";

client.on("message", async (msg: Message) => {
    if (!msg.content.startsWith(prefix)) return;

    const contact = msg.author;
    const [cmd, ...args] = msg.content.trim().slice(prefix.length).split(/ +/g);
    const command = CommandRegistry.get(cmd.toLowerCase());
    if (!command) return;

    const chat = await msg.getChat();

    if (
        (!chat.isGroup() && !msg.fromMe && command.admin) ||
        (!msg.fromMe && command.admin && chat.isGroup() && !chat.isAdmin(contact))
    ) return msg.reply("*You do not have permission to execute this command*");

    command.cb(contact, msg, args);
});