const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const jwt = process.env.JWT;
const reportId = process.env.REPORT_ID;

if (!jwt || !reportId) {
  console.error("Missing JWT or REPORT_ID env vars.");
  process.exit(1);
}

const run = async () => {
  const res = await fetch(`${baseUrl}/api/reports/generate_html`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ report_id: reportId })
  });

  if (!res.ok) {
    console.error("Request failed", res.status);
    process.exit(1);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    console.error("Unexpected content-type", contentType);
    process.exit(1);
  }

  const buffer = await res.arrayBuffer();
  console.log(`OK: ${buffer.byteLength} bytes`);
};

run().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
