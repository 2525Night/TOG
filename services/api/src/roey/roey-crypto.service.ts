import {
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

@Injectable()
export class RoeyCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  decrypt(payload: string): string {
    try {
      const [ivPart, tagPart, ciphertextPart] = payload.split(".");
      if (!ivPart || !tagPart || !ciphertextPart) throw new Error("invalid");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(ivPart, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ServiceUnavailableException(
        "לא ניתן לקרוא את חיבור Google AI Studio. יש לחבר אותו מחדש",
      );
    }
  }

  keyHint(apiKey: string): string {
    return apiKey.slice(-4);
  }

  private key(): Buffer {
    const secret = this.config.get<string>(
      "ROEY_CREDENTIALS_ENCRYPTION_KEY",
    );
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        "הצפנת החיבור של Roey עדיין לא הוגדרה בשרת",
      );
    }
    return createHash("sha256").update(secret, "utf8").digest();
  }
}
