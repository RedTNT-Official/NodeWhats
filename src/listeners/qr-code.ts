import { client, logo } from "../api/index";
import terminal from "qrcode-terminal";
import Spinner from "../loading";

client.on("qr", (base64: string) => {
    Spinner.stop();
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
});