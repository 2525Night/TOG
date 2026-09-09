import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [
      "http://localhost:3005",
      "http://localhost:3002",
      "http://127.0.0.1:3005",
      "http://127.0.0.1:3002",
      "capacitor://localhost",
      "http://localhost",
      "https://moneytail-web.vercel.app",
      /^https:\/\/moneytail(?:-[a-z0-9-]+)?-tog6\.vercel\.app$/,
      ...extraOrigins,
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix("api");
  const port = Number(process.env.API_PORT || process.env.PORT || 3001);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`MoneyTail5 API listening on http://0.0.0.0:${port}/api`);
}

bootstrap();
