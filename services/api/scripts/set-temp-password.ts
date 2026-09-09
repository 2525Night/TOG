import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const p = new PrismaClient();

async function main() {
  const email = "uriyossef@gmail.com";
  const user = await p.user.findUnique({ where: { email } });
  if (!user) {
    console.log("NOT_FOUND");
    return;
  }
  const password = "MTail3!";
  const passwordHash = await bcrypt.hash(password, 10);
  await p.user.update({
    where: { id: user.id },
    data: { passwordHash, onboardingCompleted: false },
  });
  console.log(
    JSON.stringify({
      email,
      passwordSet: true,
      tempPassword: password,
      onboardingCompleted: false,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
