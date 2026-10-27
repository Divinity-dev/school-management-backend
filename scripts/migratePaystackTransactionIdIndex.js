import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required to migrate the Paystack transaction index.");
}

const indexName = "paystackTransactionId_unique_string";

const run = async () => {
  await mongoose.connect(uri, { autoIndex: false });

  const database = mongoose.connection.db;
  const collections = await database
    .listCollections({ name: "payments" })
    .toArray();

  if (collections.length === 0) {
    throw new Error(
      'The "payments" collection does not exist. No index changes were made.'
    );
  }

  const payments = database.collection("payments");

  // Stop before changing indexes if legacy data already contains duplicate
  // real transaction IDs. Such records need manual reconciliation first.
  const duplicates = await payments
    .aggregate([
      {
        $match: {
          paystackTransactionId: { $type: "string" },
        },
      },
      {
        $group: {
          _id: "$paystackTransactionId",
          count: { $sum: 1 },
          paymentIds: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();

  if (duplicates.length > 0) {
    throw new Error(
      "Duplicate Paystack transaction IDs were found. No index changes were made: " +
        JSON.stringify(duplicates)
    );
  }

  const existingIndexes = await payments.listIndexes().toArray();

  // Remove old single-field indexes that do not use a partial filter.
  // Keep the corrected partial index if the application already created it.
  for (const index of existingIndexes) {
    const isOnlyPaystackTransactionId =
      index.key &&
      Object.keys(index.key).length === 1 &&
      index.key.paystackTransactionId === 1;

    if (
      isOnlyPaystackTransactionId &&
      !index.partialFilterExpression
    ) {
      console.log("Dropping outdated index:", index.name);
      await payments.dropIndex(index.name);
    }
  }

  const indexesAfterCleanup = await payments.listIndexes().toArray();
  const correctedIndex = indexesAfterCleanup.find(
    (index) => index.name === indexName
  );

  if (!correctedIndex) {
    await payments.createIndex(
      { paystackTransactionId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          paystackTransactionId: { $type: "string" },
        },
        name: indexName,
      }
    );
  } else if (
    correctedIndex.unique !== true ||
    correctedIndex.partialFilterExpression?.paystackTransactionId?.$type !==
      "string"
  ) {
    throw new Error(
      "The corrected index name exists with unexpected options. Inspect the payments indexes manually."
    );
  }

  console.log(
    "Paystack transaction index migration completed. Only string transaction IDs are uniquely indexed; null/missing values are allowed."
  );
};

try {
  await run();
} catch (error) {
  console.error("Paystack transaction index migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
