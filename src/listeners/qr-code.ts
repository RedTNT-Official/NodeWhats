import { client, logo } from "../api/index";
import * as Spinner from "loading-spinner";
import terminal from "qrcode-terminal";

client.on("qr", (base64: string) => {
    Spinner.stop();
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
});