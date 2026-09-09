import { INestApplication, ValidationPipe } from "@nestjs/common";

export function configureMoneyTailApp(app: INestApplication) {
  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
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
}
