
import "dotenv/config";
import mongoose from "mongoose";

import User from "../models/User.js";
import generateUsername from "../utils/generateUsername.js";

const updateExistingUsernames = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from your environment");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB.");

    const users = await User.find({
      role: {
        $in: ["schoolAdmin", "teacher", "student", "parent"],
      },
      $or: [
        { username: { $exists: false } },
        { username: null },
        { username: "" },
      ],
    }).sort({ _id: 1 });

    console.log(`Found ${users.length} accounts without usernames.`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        if (!user.firstName?.trim() || !user.lastName?.trim()) {
          console.error(
            `Skipped account ${user._id}: first name or last name is missing.`
          );
          skipped += 1;
          continue;
        }

        let saved = false;
        let attempts = 0;

        while (!saved && attempts < 5) {
          attempts += 1;

          user.username = await generateUsername(
            user.firstName,
            user.lastName
          );

          try {
            await user.save();
            saved = true;
          } catch (error) {
            if (error.code === 11000 && attempts < 5) {
              continue;
            }

            throw error;
          }
        }

        if (saved) {
          updated += 1;
          console.log(
            `Updated ${user.role}: ${user.firstName} ${user.lastName} -> ${user.username}`
          );
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to update account ${user._id}:`,
          error.message
        );
      }
    }

    console.log("\nUsername migration completed.");
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
  } catch (error) {
    console.error("Username migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

updateExistingUsernames();
