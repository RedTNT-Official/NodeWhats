import { client, logo } from "../api/index";
import Spinner from "../loading";
import terminal from "qrcode-terminal";

client.on("qr", (base64: string) => {
    Spinner.stop();
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
});