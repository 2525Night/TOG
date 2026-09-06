const http = require("http");

const body = Buffer.from(
  JSON.stringify({
    email: "admin@moneytail.local",
    password: "Pa$$word",
  }),
  "utf8",
);

const req = http.request(
  {
    hostname: "localhost",
    port: 3001,
    path: "/api/auth/login",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": body.length,
    },
  },
  (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => {
      console.log(res.statusCode, b);
      if (res.statusCode !== 201 && res.statusCode !== 200) process.exit(1);
      const json = JSON.parse(b);
      if (json.user?.role !== "ADMIN") process.exit(1);
      console.log("ADMIN_LOGIN_OK");
    });
  },
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.write(body);
req.end();
