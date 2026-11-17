
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY =
  Deno.env.get("TRIPKHATA_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("RESEND_FROM") ??
  "";

const EMAIL_SUBJECT = "New Transaction Added – Manali TripKhata";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function rest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Database error ${response.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(amount) || 0);

const safe = (value: unknown) =>
  String(value ?? "—").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "POST required" }, 405);
    }

    const missingSecrets = [];

if (!SUPABASE_URL) missingSecrets.push("SUPABASE_URL");
if (!SERVICE_ROLE_KEY) missingSecrets.push("TRIPKHATA_SERVICE_ROLE_KEY");
if (!RESEND_API_KEY) missingSecrets.push("RESEND_API_KEY");
if (!RESEND_FROM) missingSecrets.push("RESEND_FROM_EMAIL / RESEND_FROM");

if (missingSecrets.length > 0) {
  console.error("Missing environment variables:", missingSecrets);
  throw new Error(
    `Missing environment variables: ${missingSecrets.join(", ")}`
  );
}

    const secret = Deno.env.get("TRIPKHATA_NOTIFY_SECRET") ?? "";
    if (!secret || req.headers.get("x-notify-secret") !== secret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json();
    const expense = payload.record;

    if (payload.type !== "INSERT" || !expense?.id || !expense?.trip_id) {
      return json({ error: "Invalid expense INSERT payload" }, 400);
    }

    const tripId = expense.trip_id;

    const [members, trips, expenses] = await Promise.all([
      rest<any[]>(
        `members?select=id,name,email,email_notifications_enabled&trip_id=eq.${tripId}&email_notifications_enabled=is.true&email=not.is.null`
      ),
      rest<any[]>(`trips?select=id,name& id=eq.${tripId}`.replace("& ", "&")),
      rest<any[]>(`expenses?select=amount&trip_id=eq.${tripId}`),
    ]);

    const nameOf = (id: string) =>
      members.find((member) => member.id === id)?.name ?? "Unknown";

    const tripName = trips[0]?.name ?? "Manali Trip";
    const paidBy = nameOf(expense.paid_by_member_id);
    const enteredBy = nameOf(expense.entered_by_member_id);
    const total = expenses.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    const date = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(expense.expense_date));

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172033">
        <h2 style="background:#059669;color:white;padding:20px;border-radius:10px">
          TripKhata – New Expense
        </h2>
        <h3>${safe(expense.title)}</h3>
        <h1 style="color:#059669">${money(expense.amount)}</h1>
        <p><b>Trip:</b> ${safe(tripName)}</p>
        <p><b>Category:</b> ${safe(expense.category)}</p>
        <p><b>Description:</b> ${safe(expense.description)}</p>
        <p><b>Paid by:</b> ${safe(paidBy)}</p>
        <p><b>Added by:</b> ${safe(enteredBy)}</p>
        <p><b>Payment method:</b> ${safe(expense.payment_method)}</p>
        <p><b>Date:</b> ${safe(date)}</p>
        <hr/>
        <h2>Total trip expenditure: ${money(total)}</h2>
        <p style="color:#64748b">You received this email because you are registered as a TripKhata member.</p>
      </div>
    `;

    const text = [
      `New expense added to ${tripName}`,
      `Title: ${expense.title}`,
      `Amount: ${money(expense.amount)}`,
      `Category: ${expense.category}`,
      `Paid by: ${paidBy}`,
      `Added by: ${enteredBy}`,
      `Payment method: ${expense.payment_method}`,
      `Date: ${date}`,
      `Total trip expenditure: ${money(total)}`,
    ].join("\n");

    const results = [];

    for (const member of members) {
      const email = String(member.email ?? "").trim();
      if (!email) continue;

      let status = "failed";
      let errorMessage: string | null = null;

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: EMAIL_SUBJECT,
            html,
            text,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message ?? JSON.stringify(result));
        }

        status = "sent";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Email failed for ${email}:`, errorMessage);
      }

      try {
        await rest("notification_logs", "POST", {
          expense_id: expense.id,
          recipient_email: email,
          delivery_status: status,
        });
      } catch (logError) {
        console.error("Notification log failed:", logError);
      }

      results.push({ email, status, error: errorMessage });
    }

    return json({
      ok: true,
      expense_id: expense.id,
      recipients: results,
    });
  } catch (error) {
    console.error("notify-new-expense error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});
