
const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getPaystackHeaders = () => {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
};

const paystackRequest = async (path, options = {}) => {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...options,
    headers: getPaystackHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(
      data.message || "Paystack request failed."
    );
  }

  return data.data;
};

// --------------------------------------------------
// Create a school subaccount
// --------------------------------------------------
export const createSubaccount = async ({
  businessName,
  bankCode,
  accountNumber,
  contactName,
  contactEmail,
  contactPhone,
}) => {
  if (!businessName || !bankCode || !accountNumber) {
    throw new Error(
      "School name, bank code, and account number are required."
    );
  }

  const data = await paystackRequest("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0,
      description: `School fees for ${businessName}`,
      ...(contactName && {
        primary_contact_name: contactName,
      }),
      ...(contactEmail && {
        primary_contact_email: contactEmail,
      }),
      ...(contactPhone && {
        primary_contact_phone: contactPhone,
      }),
    }),
  });

  if (!data.subaccount_code) {
    throw new Error(
      "Paystack did not return a subaccount code."
    );
  }

  return data;
};

// --------------------------------------------------
// Update an existing school subaccount
// --------------------------------------------------
export const updateSubaccount = async ({
  subaccountCode,
  businessName,
  bankCode,
  accountNumber,
}) => {
  if (!subaccountCode) {
    throw new Error("Subaccount code is required.");
  }

  const data = await paystackRequest(
    `/subaccount/${encodeURIComponent(subaccountCode)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        business_name: businessName,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: 0,
        active: true,
      }),
    }
  );

  if (!data.subaccount_code) {
    throw new Error(
      "Paystack did not confirm the updated subaccount."
    );
  }

  return data;
};

// --------------------------------------------------
// Initialize a Paystack transaction
// --------------------------------------------------
export const initializeTransaction = async ({
  email,
  amount,
  reference,
  callbackUrl,
  metadata,
  subaccountCode,
  bearer,
}) => {
  const payload = {
    email,
    amount,
    reference,
    callback_url: callbackUrl,
    metadata,
  };

  // Only include routing when explicitly requested by
  // a backend caller, such as school-fee payments.
  if (subaccountCode) {
    payload.subaccount = subaccountCode;
    payload.bearer = bearer || "subaccount";
  }

  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

// --------------------------------------------------
// Verify a Paystack transaction
// --------------------------------------------------
export const verifyTransaction = async (reference) => {
  return paystackRequest(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" }
  );
};
