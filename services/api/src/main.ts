import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      "http://localhost:3005",
      "http://localhost:3002",
      "http://127.0.0.1:3005",
      "http://127.0.0.1:3002",
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
  const port = Number(process.env.API_PORT || 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MoneyTail API listening on http://localhost:${port}/api`);
}

bootstrap();
