import { GroupChat, Message } from "whatsapp-web.js";
import { CommandRegistry } from "../Utils";
import { client, prefix } from "../api/index";

client.on("message_create", async (msg: Message) => {
    if (msg.from === 'status@broadcast' || !msg.body.startsWith(prefix)) return;

    const contact = await msg.getContact();
    const [cmd, ...args] = msg.body.trim().slice(prefix.length).split(/ +/g);
    const command = CommandRegistry.get(cmd.toLowerCase());
    if (!command) return;

    const chat = await msg.getChat() as GroupChat;

    if (
        (!chat.isGroup && !msg.fromMe && command.admin) ||
        (!msg.fromMe && command.admin && chat.isGroup && !contact.isAdmin(chat))
    ) return msg.reply("*You do not have permission to execute this command*");

    command.cb(contact, msg, args);
});