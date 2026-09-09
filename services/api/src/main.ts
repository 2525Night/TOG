import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureMoneyTailApp } from "./app-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureMoneyTailApp(app);
  const port = Number(process.env.API_PORT || process.env.PORT || 3001);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`MoneyTail5 API listening on http://0.0.0.0:${port}/api`);
}

bootstrap();
