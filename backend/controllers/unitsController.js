const pool = require("../config/db.js");

const pad = (n) => String(n).padStart(2, "0");
// "YYYY-MM" for now in the app timezone; an invalid APP_TIMEZONE falls back to Asia/Dhaka.
const currentMonth = () => {
  const make = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  let parts;
  try { parts = make(process.env.APP_TIMEZONE || "Asia/Dhaka"); } catch { parts = make("Asia/Dhaka"); }
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { ym: `${get("year")}-${pad(get("month"))}`, day: get("day") };
};

// GET /units  [landlord] — every property split into occupied (active lease) and vacant
const getUnits = async (req, res) => {
  // A flat counts as occupied when it has an active lease OR the listing is marked rented
  // (some flats are marked rented with a tenant_id but no active contract yet).
  const { rows } = await pool.query(
    `SELECT p.property_id, p.address, p.rate::float AS listing_rate, p.availability_status::text AS availability_status,
            p.is_hidden, p.floor, p.total_floors,
            c.contract_id, c.status::text AS contract_status, c.rate::float AS lease_rate, c.end_date::text AS end_date,
            t.user_id AS tenant_id, t.name AS tenant_name, t.contact_number AS tenant_phone
       FROM properties p
       LEFT JOIN LATERAL (
         SELECT * FROM contracts c
          WHERE c.property_id = p.property_id
            AND c.status::text IN ('active', 'fully_signed', 'signed_by_owner', 'signed_by_tenant')
          ORDER BY (c.status::text = 'active') DESC, (c.status::text = 'fully_signed') DESC, c.start_date DESC
          LIMIT 1
       ) c ON TRUE
       LEFT JOIN users t ON t.user_id = COALESCE(c.tenant_id, p.tenant_id)
      WHERE p.owner_id = $1 AND p.availability_status::text <> 'archived'
      ORDER BY p.property_id`,
    [req.user.user_id],
  );

  const ids = rows.filter((r) => r.contract_status === "active").map((r) => r.contract_id);
  const paid = new Set();
  const { ym, day } = currentMonth();
  if (ids.length) {
    const pay = await pool.query(
      `SELECT DISTINCT contract_id FROM payments
        WHERE contract_id = ANY($1::int[]) AND status = 'paid' AND to_char(payment_date, 'YYYY-MM') = $2`,
      [ids, ym],
    );
    pay.rows.forEach((r) => paid.add(r.contract_id));
  }

  const occupied = [];
  const vacant = [];
  for (const r of rows) {
    const base = { property_id: r.property_id, address: r.address, floor: r.floor, total_floors: r.total_floors, availability_status: r.availability_status };
    if (r.contract_status === "active" || r.availability_status === "rented") {
      const active = r.contract_status === "active";
      occupied.push({
        ...base,
        tenant: r.tenant_id ? { user_id: r.tenant_id, name: r.tenant_name, phone: r.tenant_phone } : null,
        contract_id: r.contract_id,
        contract_status: r.contract_status,
        rent: r.lease_rate ?? r.listing_rate,
        lease_end: r.end_date,
        rent_status: active ? (paid.has(r.contract_id) ? "paid" : day > 5 ? "overdue" : "due") : "unknown",
      });
    } else {
      vacant.push({ ...base, rent: r.listing_rate, listing_status: r.is_hidden ? "hidden" : r.availability_status === "available" ? "listed" : r.availability_status });
    }
  }
  return res.status(200).json({ data: { occupied, vacant } });
};

module.exports = { getUnits };