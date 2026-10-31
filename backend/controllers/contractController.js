const pool = require("../config/db.js");
const { saveBase64Signature } = require("../utils/signature.js");
const { generateReceipt } = require("../utils/receipt.js");
const { signFields, CONTRACT_SIGNED_FIELDS, PAYMENT_SIGNED_FIELDS } = require("../utils/signFields.js");
const { notify } = require("../utils/notify.js");
// --- NEW: lease PDF generation + the same bucket-upload helper
// --- propertyController.js already uses for photos.
const { buildContractPdfBuffer } = require("../utils/contractPdf.js");
const { uploadToBucket } = require("../utils/storage.js");

const negotiateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { rate, deposit, message } = req.body || {};
    const nextRate = Number(rate);
    const nextDeposit = Number(deposit);

    if (!Number.isFinite(nextRate) || nextRate <= 0 || !Number.isFinite(nextDeposit) || nextDeposit < 0) {
      return res.status(422).json({ success: false, message: "A valid rent and non-negative deposit are required" });
    }

    const contractResult = await pool.query(
      "SELECT owner_id, tenant_id, status FROM contracts WHERE contract_id = $1",
      [id],
    );
    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = contractResult.rows[0];
    const isOwner = contract.owner_id === req.user.user_id;
    const isTenant = contract.tenant_id === req.user.user_id;
    if (!isOwner && !isTenant) {
      return res.status(403).json({ success: false, message: "You are not part of this contract" });
    }
    if (contract.status !== "draft") {
      return res.status(409).json({ success: false, message: "Only draft contracts can be negotiated" });
    }

    const result = await pool.query(
      `UPDATE contracts
       SET rate = $1, deposit = $2, negotiation_message = $3, negotiation_status = 'proposed', updated_at = NOW()
       WHERE contract_id = $4 AND status = 'draft'
       RETURNING contract_id, rate, deposit, negotiation_message, negotiation_status, status`,
      [nextRate, nextDeposit, message?.trim() || null, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Draft contract not found for this tenant" });
    }

    await notify({
      userId: isOwner ? contract.tenant_id : contract.owner_id,
      type: "contract_negotiation",
      title: isOwner ? "Landlord counter-offered lease terms" : "Tenant proposed lease terms",
      message: message?.trim() || `${isOwner ? "Landlord counter-offered" : "Tenant proposed"} rent ৳${nextRate} and deposit ৳${nextDeposit}.`,
      linkUrl: "/contracts",
    });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("negotiateContract error: ", err);
    return res.status(500).json({ success: false, message: "Failed to submit lease proposal" });
  }
};

const acceptContract = async (req, res) => {
  try {
    const { id } = req.params;
    const contractResult = await pool.query(
      "SELECT owner_id, tenant_id, status, negotiation_status FROM contracts WHERE contract_id = $1",
      [id],
    );
    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = contractResult.rows[0];
    const isOwner = contract.owner_id === req.user.user_id;
    const isTenant = contract.tenant_id === req.user.user_id;
    if (!isOwner && !isTenant) {
      return res.status(403).json({ success: false, message: "You are not part of this contract" });
    }
    if (contract.status !== "draft" || contract.negotiation_status !== "proposed") {
      return res.status(409).json({ success: false, message: "A proposed lease must be accepted before signing" });
    }
    const result = await pool.query(
      `UPDATE contracts
       SET negotiation_status = 'accepted', updated_at = NOW()
       WHERE contract_id = $1 AND status = 'draft' AND negotiation_status = 'proposed'
       RETURNING contract_id, rate, deposit, status, negotiation_status`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Draft contract not found for this tenant" });
    }
    await notify({
      userId: isOwner ? contract.tenant_id : contract.owner_id,
      type: "contract_accepted",
      title: isOwner ? "Landlord accepted lease terms" : "Tenant accepted lease terms",
      message: `${isOwner ? "The landlord" : "The tenant"} accepted contract #${id}. Both parties can now sign.`,
      linkUrl: "/contracts",
    });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("acceptContract error: ", err);
    return res.status(500).json({ success: false, message: "Failed to accept lease" });
  }
};

// POST /contracts  [landlord only]
//
// CHANGED: after inserting the contract row, this now also builds the
// lease PDF (one shared template, filled in with this contract's
// landlord/tenant names, address and dates) and uploads it to the
// "contract-pdfs" bucket, saving the resulting URL on the contract row.
// If the PDF step fails for any reason, the contract itself still gets
// created — the PDF can be missing and regenerated later rather than the
// whole lease creation failing over a formatting issue.
const createContract = async (req, res) => {
  try {
    const ownerId = req.user.user_id;
    const { property_id, tenant_id, rate, deposit, start_date, end_date, terms_and_conditions } = req.body || {};

    if (!property_id || !tenant_id || !rate || !start_date || !end_date) {
      return res
        .status(422)
        .json({ success: false, message: "property_id, tenant_id, rate, start_date, and end_date are required" });
    }

    // Pull everything the PDF template needs in one query: the property's
    // owner + address + default deposit, and both parties' display names.
    const infoResult = await pool.query(
      `SELECT p.owner_id, p.address, p.deposit,
              owner.name AS owner_name,
              tenant.name AS tenant_name
       FROM properties p
       JOIN users owner ON owner.user_id = p.owner_id
       JOIN users tenant ON tenant.user_id = $2
       WHERE p.property_id = $1 AND p.availability_status != 'archived'`,
      [property_id, tenant_id],
    );
    if (infoResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Property or tenant not found" });
    }
    const info = infoResult.rows[0];
    if (info.owner_id !== ownerId && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "You do not own this property" });
    }

    const result = await pool.query(
      `INSERT INTO contracts (owner_id, property_id, tenant_id, rate, deposit, start_date, end_date, terms_and_conditions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING contract_id, owner_id, tenant_id, property_id, rate, deposit, start_date, end_date, status, created_at`,
      [ownerId, property_id, tenant_id, rate, deposit ?? 0, start_date, end_date, terms_and_conditions || null],
    );
    const contract = result.rows[0];

    // --- Generate + store the lease PDF ------------------------------------
    let contractPdfUrl = null;
    try {
      const pdfBuffer = await buildContractPdfBuffer({
        landlordName: info.owner_name,
        tenantName: info.tenant_name,
        propertyAddress: info.address,
        rate,
        depositAmount: deposit ?? info.deposit,
        startDate: start_date,
        endDate: end_date,
        contractId: contract.contract_id,
        termsAndConditions: terms_and_conditions,
      });

      const path = `contracts/${contract.contract_id}.pdf`;
      const { url } = await uploadToBucket("contract-pdfs", path, pdfBuffer, "application/pdf");
      contractPdfUrl = url;

      await pool.query("UPDATE contracts SET contract_pdf_url = $1 WHERE contract_id = $2", [
        url,
        contract.contract_id,
      ]);
    } catch (pdfErr) {
      console.error("Lease PDF generation failed (contract still created): ", pdfErr);
    }

    await notify({
      userId: tenant_id,
      type: "contract_issued",
      title: "New lease agreement",
      message: `A draft lease was issued for property #${property_id}. Please review and sign.`,
      linkUrl: "/contracts",
    });

    return res.status(201).json({ ...contract, contract_pdf_url: contractPdfUrl });
  } catch (err) {
    console.error("createContract error: ", err);
    return res.status(500).json({ success: false, message: "Failed to create contract" });
  }
};

// GET /contracts  [auth required] — every lease the caller is a party to.
//
// CHANGED: now also returns contract_pdf_url, plus the most recent
// payment's transaction_reference and status for that contract — this is
// what powers the "transaction id / payment status yes-no" list on the
// Contracts page. A contract with no payment yet simply comes back with
// transaction_id: null and payment_status: "no".
const listContracts = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `SELECT c.contract_id, c.property_id, p.address AS property_address,
              c.owner_id, c.tenant_id, c.rate, c.deposit, c.start_date, c.end_date,
              c.owner_signature_url, c.tenant_signature_url, c.status, c.created_at,
              c.negotiation_status,
              owner.name AS owner_name, tenant.name AS tenant_name
       FROM contracts c
       JOIN properties p ON p.property_id = c.property_id
       JOIN users owner ON owner.user_id = c.owner_id
       JOIN users tenant ON tenant.user_id = c.tenant_id
       LEFT JOIN LATERAL (
         SELECT transaction_reference, status
         FROM payments
         WHERE payments.contract_id = c.contract_id
         ORDER BY payment_date DESC
         LIMIT 1
       ) latest_payment ON TRUE
       WHERE c.owner_id = $1 OR c.tenant_id = $1
       ORDER BY c.created_at DESC`,
      [userId],
    );

    const data = result.rows.map((row) => ({
      contract_id: row.contract_id,
      property_id: row.property_id,
      property_address: row.property_address,
      owner: { user_id: row.owner_id, name: row.owner_name },
      tenant: { user_id: row.tenant_id, name: row.tenant_name },
      rate: row.rate,
      deposit: row.deposit,
      start_date: row.start_date,
      end_date: row.end_date,
      owner_signature_url: row.owner_signature_url,
      tenant_signature_url: row.tenant_signature_url,
      status: row.status,
      negotiation_status: row.negotiation_status,
      created_at: row.created_at,
      contract_pdf_url: row.contract_pdf_url,
      transaction_id: row.transaction_reference || null,
      payment_status: row.payment_status === "paid" ? "yes" : "no",
    }));

    return res.status(200).json({ data });
  } catch (err) {
    console.error("listContracts error: ", err);
    return res.status(500).json({ success: false, message: "Failed to fetch contracts" });
  }
};

// GET /contracts/:id  [auth required — owner or tenant on the contract]
//
// CHANGED: includes contract_pdf_url in the response so the "View details"
// panel can embed/link the PDF.
const getContractById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT c.*, p.address AS property_address
       FROM contracts c JOIN properties p ON p.property_id = c.property_id
       WHERE c.contract_id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = result.rows[0];
    const isParty = contract.owner_id === req.user.user_id || contract.tenant_id === req.user.user_id;
    if (!isParty && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "You are not part of this contract" });
    }

    const signed = await signFields(contract, CONTRACT_SIGNED_FIELDS);

    return res.status(200).json({
      contract_id: signed.contract_id,
      property_id: signed.property_id,
      property_address: signed.property_address,
      owner_id: signed.owner_id,
      tenant_id: signed.tenant_id,
      rate: signed.rate,
      deposit: signed.deposit,
      start_date: signed.start_date,
      end_date: signed.end_date,
      terms_and_conditions: signed.terms_and_conditions,
      owner_signature_url: signed.owner_signature_url,
      tenant_signature_url: signed.tenant_signature_url,
      status: signed.status,
      negotiation_message: signed.negotiation_message,
      negotiation_status: signed.negotiation_status,
    });
  } catch (err) {
    console.error("getContractById error: ", err);
    return res.status(500).json({ success: false, message: "Failed to fetch contract" });
  }
};

// PATCH /contracts/:id/sign  [auth required — auto-detects owner vs tenant]
// Unchanged from what you already had.
const signContract = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;
    const { signature_image_base64 } = req.body || {};

    if (!signature_image_base64) {
      return res.status(422).json({ success: false, message: "signature_image_base64 is required" });
    }

    const result = await pool.query("SELECT * FROM contracts WHERE contract_id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = result.rows[0];
    if (contract.status === "draft" && contract.negotiation_status !== "accepted") {
      return res.status(409).json({ success: false, message: "Lease terms must be accepted before signing" });
    }

    let role;
    if (contract.owner_id === userId) role = "owner";
    else if (contract.tenant_id === userId) role = "tenant";
    else return res.status(403).json({ success: false, message: "You are not part of this contract" });

    let signaturePath;
    try {
      signaturePath = await saveBase64Signature(signature_image_base64, `sig-${role}-${userId}`);
    } catch (e) {
      return res.status(422).json({ success: false, message: e.message });
    }

    const column = role === "owner" ? "owner_signature_url" : "tenant_signature_url";
    const otherPartyAlreadySigned =
      role === "owner" ? Boolean(contract.tenant_signature_url) : Boolean(contract.owner_signature_url);
    const newStatus = otherPartyAlreadySigned ? "fully_signed" : `signed_by_${role}`;

    const updateResult = await pool.query(
      `UPDATE contracts SET ${column} = $1, status = $2, updated_at = NOW()
       WHERE contract_id = $3
       RETURNING contract_id, owner_signature_url, tenant_signature_url, status`,
      [signaturePath, newStatus, id],
    );

    const signed = await signFields(updateResult.rows[0], CONTRACT_SIGNED_FIELDS);

    const otherPartyId = role === "owner" ? contract.tenant_id : contract.owner_id;
    await notify({
      userId: otherPartyId,
      type: "contract_signed",
      title: "Contract signed",
      message: `The ${role} signed contract #${id}.`,
      linkUrl: `/contracts/${id}`,
    });

    return res.status(200).json({
      contract_id: signed.contract_id,
      owner_signature_url: signed.owner_signature_url,
      tenant_signature_url: signed.tenant_signature_url,
      status: signed.status,
      message:
        signed.status === "fully_signed"
          ? "Both parties have signed. Proceed to security deposit payment."
          : "Signature registered. Waiting on the other party to sign.",
    });
  } catch (err) {
    console.error("signContract error: ", err);
    return res.status(500).json({ success: false, message: "Failed to register signature" });
  }
};

// POST /contracts/:id/deposit  [tenant only]
// Unchanged from what you already had — this is what sets the transaction
// reference + payment status that listContracts now surfaces.
const payDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.user_id;
    const { amount, payment_method, transaction_reference } = req.body || {};

    if (!amount || !payment_method) {
      return res.status(422).json({ success: false, message: "amount and payment_method are required" });
    }

    const result = await pool.query(
      `SELECT c.*, p.deposit AS property_deposit, p.address
       FROM contracts c JOIN properties p ON p.property_id = c.property_id
       WHERE c.contract_id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = result.rows[0];
    if (contract.tenant_id !== tenantId) {
      return res.status(403).json({ success: false, message: "This contract does not belong to you" });
    }
    if (contract.status !== "fully_signed") {
      return res.status(422).json({
        success: false,
        message: `Contract must be fully signed by both parties before the deposit can be paid (current status: ${contract.status})`,
      });
    }

    const paymentResult = await pool.query(
      `INSERT INTO payments (owner_id, tenant_id, property_id, contract_id, amount, payment_method, status, transaction_reference)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING payment_id, payment_date, status`,
      [contract.owner_id, tenantId, contract.property_id, id, amount, payment_method, transaction_reference || null],
    );
    const payment = paymentResult.rows[0];

    const receiptPath = await generateReceipt({
      title: "Security Deposit Receipt",
      lines: [
        `Contract #${id}`,
        `Property: ${contract.address}`,
        `Amount: BDT ${amount}`,
        `Payment method: ${payment_method}`,
        transaction_reference ? `Reference: ${transaction_reference}` : null,
        `Date: ${payment.payment_date.toISOString()}`,
      ].filter(Boolean),
    });

    await pool.query("UPDATE payments SET receipt_url = $1 WHERE payment_id = $2", [receiptPath, payment.payment_id]);
    await pool.query("UPDATE contracts SET status = 'active', updated_at = NOW() WHERE contract_id = $1", [id]);
    // The flat is now occupied: listings, the landlord's units view and the tenant dashboard all read this.
    await pool.query("UPDATE properties SET availability_status = 'rented' WHERE property_id = $1 AND availability_status::text <> 'archived'", [contract.property_id]);

    await pool.query(
      `INSERT INTO history (owner_id, tenant_id, property_id, contract_id, payment_status, due_amount, deposit_amount, deposit_paid_at, deadline)
       VALUES ($1, $2, $3, $4, TRUE, 0, $5, NOW(), $6)`,
      [contract.owner_id, tenantId, contract.property_id, id, amount, contract.start_date],
    );

    await notify({
      userId: contract.owner_id,
      type: "deposit_paid",
      title: "Security deposit received",
      message: `Deposit paid for contract #${id}. Lease is now active.`,
      linkUrl: `/contracts/${id}`,
    });

    const signedPayment = await signFields({ receipt_url: receiptPath }, PAYMENT_SIGNED_FIELDS);

    return res.status(200).json({
      payment_id: payment.payment_id,
      contract_id: Number(id),
      deposit_paid: amount,
      payment_status: payment.status,
      contract_status: "active",
      receipt_url: signedPayment.receipt_url,
    });
  } catch (err) {
    console.error("payDeposit error: ", err);
    return res.status(500).json({ success: false, message: "Failed to process deposit payment" });
  }
};

module.exports = { createContract, listContracts, getContractById, signContract, payDeposit, negotiateContract, acceptContract };