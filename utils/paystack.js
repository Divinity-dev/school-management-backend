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

// --------------------------------------------------
// Initialize a Paystack transaction
// --------------------------------------------------
export const initializeTransaction = async ({
  email,
  amount,
  reference,
  callbackUrl,
  metadata,
}) => {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      method: "POST",
      headers: getPaystackHeaders(),
      body: JSON.stringify({
        email,
        amount,
        reference,
        callback_url: callbackUrl,
        metadata,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(
      data.message || "Failed to initialize Paystack transaction."
    );
  }

  return data.data;
};

// --------------------------------------------------
// Verify a Paystack transaction
// --------------------------------------------------
export const verifyTransaction = async (reference) => {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(
      reference
    )}`,
    {
      method: "GET",
      headers: getPaystackHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(
      data.message || "Failed to verify Paystack transaction."
    );
  }

  return data.data;
};